using System.Text.Json.Nodes;
using Android;
using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Print;
using Android.Runtime;
using Android.Speech;
using Android.Speech.Tts;
using Android.Webkit;
using Java.Interop;

namespace MechGarage.Android;

/// <summary>
/// What the game page can ask the phone to do, as window.MechGarageAndroid: listen(), stopListening(), speak(text),
/// stopSpeaking(), voices(), setVoice(name), print() and quit().
/// Answers come back as calls to window.mechGarageNative({ type, ... }), the same messages the Windows app sends
/// (see web/js/voice.js). Listening asks the phone's speech service to work offline when it can.
/// </summary>
internal sealed class GarageBridge : Java.Lang.Object
{
    private readonly Activity _activity;
    private readonly WebView _web;
    private SpeechRecognizer? _recognizer;
    private TextToSpeech? _tts;
    private bool _ttsReady;
    private string? _pendingSpeech;
    private bool _listenAfterPermission;

    public GarageBridge(Activity activity, WebView web)
    {
        _activity = activity;
        _web = web;
        // Speech is a bonus: if the phone's text-to-speech can't start, the game still runs (the robot just types).
        try { _tts = new TextToSpeech(activity, new TtsInit(this)); }
        catch (Exception e) { global::Android.Util.Log.Warn("MechGarage", $"No text-to-speech: {e.Message}"); }
    }

    // ---------- called from the page (on a background thread) ----------

    [JavascriptInterface, Export("listen")]
    public void Listen() => _activity.RunOnUiThread(StartListening);

    [JavascriptInterface, Export("stopListening")]
    public void StopListening() => _activity.RunOnUiThread(() => _recognizer?.StopListening());

    [JavascriptInterface, Export("speak")]
    public void Speak(string text) => _activity.RunOnUiThread(() => SpeakNow(text));

    [JavascriptInterface, Export("stopSpeaking")]
    public void StopSpeaking() => _activity.RunOnUiThread(() => _tts?.Stop());

    /// <summary>The phone's English voices as JSON [{ id, name, lang, quality, online }], for the voice picker.</summary>
    [JavascriptInterface, Export("voices")]
    public string Voices()
    {
        var list = new System.Text.Json.Nodes.JsonArray();
        if (!_ttsReady || _tts?.Voices is null) return list.ToJsonString();
        foreach (var v in _tts.Voices.Where(v => v.Locale?.Language == "en").OrderByDescending(v => v.Quality))
            list.Add(new JsonObject { ["id"] = v.Name, ["name"] = v.Name, ["lang"] = v.Locale?.ToLanguageTag(), ["quality"] = (int)v.Quality, ["online"] = v.IsNetworkConnectionRequired });
        return list.ToJsonString();
    }

    [JavascriptInterface, Export("setVoice")]
    public void SetVoice(string name) => _activity.RunOnUiThread(() =>
    {
        var v = _tts?.Voices?.FirstOrDefault(x => x.Name == name);
        if (v is not null) _tts!.SetVoice(v);
    });

    /// <summary>Closes the game (the Exit button).</summary>
    [JavascriptInterface, Export("quit")]
    public void Quit() => _activity.RunOnUiThread(() => _activity.FinishAndRemoveTask());

    /// <summary>Prints the page (the blueprint's build plan, laid out by the page's print styles) or saves it as a PDF.</summary>
    [JavascriptInterface, Export("print")]
    public void Print() => _activity.RunOnUiThread(() =>
    {
        if (_activity.GetSystemService(Context.PrintService) is PrintManager printer)
            printer.Print("Mech build plan", _web.CreatePrintDocumentAdapter("Mech build plan"), null);
    });

    // ---------- listening ----------

    private void StartListening()
    {
        if (_activity.CheckSelfPermission(Manifest.Permission.RecordAudio) != Permission.Granted)
        {
            _listenAfterPermission = true;
            _activity.RequestPermissions([Manifest.Permission.RecordAudio], MainActivity.MicRequest);
            return;
        }
        if (!SpeechRecognizer.IsRecognitionAvailable(_activity))
        {
            Send(new JsonObject { ["type"] = "voiceError", ["message"] = "This phone has no speech service. Type to your helper instead." });
            return;
        }
        _tts?.Stop(); // don't listen to ourselves
        _recognizer ??= CreateRecognizer();
        var intent = new Intent(RecognizerIntent.ActionRecognizeSpeech);
        intent.PutExtra(RecognizerIntent.ExtraLanguageModel, RecognizerIntent.LanguageModelFreeForm);
        intent.PutExtra(RecognizerIntent.ExtraLanguage, "en-US");
        intent.PutExtra(RecognizerIntent.ExtraPartialResults, true);
        intent.PutExtra(RecognizerIntent.ExtraPreferOffline, true);
        intent.PutExtra(RecognizerIntent.ExtraMaxResults, 1);
        intent.PutExtra(RecognizerIntent.ExtraSpeechInputCompleteSilenceLengthMillis, 900L);
        _recognizer.StartListening(intent);
    }

    public void MicPermissionAnswered(bool granted)
    {
        if (!_listenAfterPermission) return;
        _listenAfterPermission = false;
        if (granted) StartListening();
        else Send(new JsonObject { ["type"] = "voiceError", ["message"] = "Mech Garage needs the microphone to hear you. You can still type." });
    }

    private SpeechRecognizer CreateRecognizer()
    {
        var r = SpeechRecognizer.CreateSpeechRecognizer(_activity)!;
        r.SetRecognitionListener(new Listener(this));
        return r;
    }

    private sealed class Listener(GarageBridge bridge) : Java.Lang.Object, IRecognitionListener
    {
        public void OnReadyForSpeech(Bundle? @params) => bridge.Send(new JsonObject { ["type"] = "listening", ["on"] = true });
        public void OnBeginningOfSpeech() { }
        public void OnRmsChanged(float rmsdB) => bridge.Send(new JsonObject { ["type"] = "level", ["value"] = Math.Clamp((rmsdB + 2) / 12.0, 0, 1) });
        public void OnBufferReceived(byte[]? buffer) { }
        public void OnEndOfSpeech() { }
        public void OnEvent(int eventType, Bundle? @params) { }

        public void OnPartialResults(Bundle? partialResults) => Report(partialResults, false);

        public void OnResults(Bundle? results)
        {
            Report(results, true);
            bridge.Send(new JsonObject { ["type"] = "listening", ["on"] = false });
        }

        public void OnError([GeneratedEnum] SpeechRecognizerError error)
        {
            var message = error switch
            {
                SpeechRecognizerError.NoMatch or SpeechRecognizerError.SpeechTimeout => "I didn't catch that. Tap the microphone and try again.",
                SpeechRecognizerError.InsufficientPermissions => "Mech Garage needs the microphone to hear you.",
                SpeechRecognizerError.Network or SpeechRecognizerError.NetworkTimeout => "Listening needs this phone's offline English speech pack, or the internet.",
                _ => null,
            };
            if (message is not null) bridge.Send(new JsonObject { ["type"] = "voiceError", ["message"] = message });
            bridge.Send(new JsonObject { ["type"] = "listening", ["on"] = false });
        }

        private void Report(Bundle? bundle, bool final)
        {
            var text = bundle?.GetStringArrayList(SpeechRecognizer.ResultsRecognition)?.FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(text)) bridge.Send(new JsonObject { ["type"] = "heard", ["text"] = text, ["final"] = final });
        }
    }

    // ---------- talking ----------

    private void SpeakNow(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        if (!_ttsReady) { _pendingSpeech = text; return; }
        _tts!.Speak(text, QueueMode.Flush, null, "say-" + System.Environment.TickCount64);
    }

    private sealed class TtsInit(GarageBridge bridge) : Java.Lang.Object, TextToSpeech.IOnInitListener
    {
        public void OnInit([GeneratedEnum] OperationResult status)
        {
            try { Setup(status); }
            catch (Exception e) { global::Android.Util.Log.Warn("MechGarage", $"Text-to-speech setup failed: {e.Message}"); }
        }

        private void Setup(OperationResult status)
        {
            if (status != OperationResult.Success || bridge._tts is null) return;
            bridge._tts.SetLanguage(Java.Util.Locale.Us);
            // The most natural US English voice the phone has that works offline (Google's are good).
            var best = bridge._tts.Voices?
                .Where(v => v.Locale?.ToLanguageTag() == "en-US" && !v.IsNetworkConnectionRequired && !(v.Features?.Contains("notInstalled") ?? false))
                .OrderByDescending(v => v.Quality).ThenBy(v => v.Latency).FirstOrDefault();
            if (best is not null) bridge._tts.SetVoice(best);
            bridge._tts.SetPitch(1.0f);
            bridge._tts.SetSpeechRate(1.0f);
            bridge._tts.SetOnUtteranceProgressListener(new Progress(bridge));
            bridge._ttsReady = true;
            bridge.Send(new JsonObject { ["type"] = "voicesChanged" });
            if (bridge._pendingSpeech is { } t) { bridge._pendingSpeech = null; bridge.SpeakNow(t); }
        }
    }

    private sealed class Progress(GarageBridge bridge) : UtteranceProgressListener
    {
        public override void OnStart(string? utteranceId) { }
        public override void OnDone(string? utteranceId) => bridge.Send(new JsonObject { ["type"] = "spoken" });
        [Obsolete("Required by the abstract class.")]
        public override void OnError(string? utteranceId) => bridge.Send(new JsonObject { ["type"] = "spoken" });
    }

    // ---------- back to the page ----------

    private void Send(JsonObject message)
    {
        var json = message.ToJsonString();
        _activity.RunOnUiThread(() => _web.EvaluateJavascript($"window.mechGarageNative && window.mechGarageNative({json})", null));
    }

    public void Pause()
    {
        _recognizer?.Cancel();
        _tts?.Stop();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _recognizer?.Destroy();
            _recognizer = null;
            _tts?.Shutdown();
            _tts = null;
        }
        base.Dispose(disposing);
    }
}
