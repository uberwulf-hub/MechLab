using System.Globalization;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Text.Json.Nodes;
using WinRtRecognizer = Windows.Media.SpeechRecognition.SpeechRecognizer;
using WinRtTopic = Windows.Media.SpeechRecognition.SpeechRecognitionTopicConstraint;
using WinRtScenario = Windows.Media.SpeechRecognition.SpeechRecognitionScenario;
using WinRtStatus = Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus;

namespace MechGarage.Windows;

/// <summary>
/// Listening and talking with Windows' own speech engines.
///
/// Listening first uses Windows' modern recogniser (the one behind Windows voice typing), which understands everyday
/// sentences far better. It needs "Online speech recognition" switched on in Windows Settings > Privacy &amp; security >
/// Speech. If that's off, it falls back to the older offline recogniser, which works best with short commands.
/// </summary>
internal sealed class Speech(Action<JsonObject> post) : IDisposable
{
    // modern (WinRT) recogniser
    private WinRtRecognizer? _modern;
    private bool _modernUnavailable;
    private bool _toldAboutOnline;
    // older offline recogniser
    private SpeechRecognitionEngine? _recognizer;
    private string _grammarKey = "";
    private bool _listening;
    private SpeechSynthesizer? _voice;

    private void Send(string type, JsonObject? extra = null)
    {
        var o = extra ?? new JsonObject();
        o["type"] = type;
        post(o);
    }

    // ---------------------------------------------------------------- listening

    public async void Listen(JsonNode? phrases)
    {
        if (_listening) return;
        _listening = true;
        _voice?.SpeakAsyncCancelAll(); // don't listen to ourselves
        if (!_modernUnavailable && await ListenModernAsync()) return;
        ListenClassic(phrases);
    }

    /// <summary>Returns false if the modern recogniser can't be used (then the classic one takes over).</summary>
    private async Task<bool> ListenModernAsync()
    {
        try
        {
            if (_modern is null)
            {
                var r = new WinRtRecognizer();
                r.Constraints.Add(new WinRtTopic(WinRtScenario.Dictation, "dictation"));
                r.Timeouts.InitialSilenceTimeout = TimeSpan.FromSeconds(6);
                r.Timeouts.EndSilenceTimeout = TimeSpan.FromSeconds(1.1);
                var compiled = await r.CompileConstraintsAsync();
                if (compiled.Status != WinRtStatus.Success)
                {
                    r.Dispose();
                    _modernUnavailable = true;
                    return false;
                }
                r.HypothesisGenerated += (_, e) => Send("heard", new JsonObject { ["text"] = e.Hypothesis.Text, ["final"] = false });
                _modern = r;
            }
            Send("listening", new JsonObject { ["on"] = true });
            var result = await _modern.RecognizeAsync();
            _listening = false;
            if (result.Status == WinRtStatus.Success && !string.IsNullOrWhiteSpace(result.Text))
                Send("heard", new JsonObject { ["text"] = result.Text, ["final"] = true });
            else if (result.Status == WinRtStatus.Success)
                Send("voiceError", new JsonObject { ["message"] = "I didn't hear anything. Tap the microphone and try again." });
            Send("listening", new JsonObject { ["on"] = false });
            return true;
        }
        catch (Exception e) when ((uint)e.HResult == 0x80045509)
        {
            // "Online speech recognition" is switched off in Windows privacy settings.
            _modernUnavailable = true;
            _modern?.Dispose();
            _modern = null;
            if (!_toldAboutOnline)
            {
                _toldAboutOnline = true;
                Send("voiceError", new JsonObject { ["message"] = "Tip: turn on Online speech recognition in Windows Settings > Privacy & security > Speech, so I understand you much better." });
            }
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            _listening = false;
            Send("voiceError", new JsonObject { ["message"] = "I can't hear: the microphone is switched off for desktop apps in Windows privacy settings." });
            Send("listening", new JsonObject { ["on"] = false });
            return true;
        }
        catch (Exception)
        {
            _modernUnavailable = true;
            _modern?.Dispose();
            _modern = null;
            return false;
        }
    }

    private void ListenClassic(JsonNode? phrases)
    {
        try
        {
            _recognizer ??= CreateRecognizer();
            if (_recognizer is null)
            {
                _listening = false;
                Send("voiceError", new JsonObject { ["message"] = "Windows speech recognition isn't installed. In Windows Settings, open Time & language > Speech and add English." });
                return;
            }
            LoadGrammars(phrases);
            _recognizer.SetInputToDefaultAudioDevice();
            _recognizer.RecognizeAsync(RecognizeMode.Single);
            Send("listening", new JsonObject { ["on"] = true });
        }
        catch (InvalidOperationException)
        {
            _listening = false;
            Send("voiceError", new JsonObject { ["message"] = "I can't hear: no microphone found, or it's switched off in Windows privacy settings." });
            Send("listening", new JsonObject { ["on"] = false });
        }
    }

    public async void StopListening()
    {
        try
        {
            if (_modern is not null && _listening) await _modern.StopRecognitionAsync();
        }
        catch (Exception) { /* already stopped */ }
        if (_recognizer is not null && _listening) _recognizer.RecognizeAsyncCancel();
    }

    private SpeechRecognitionEngine? CreateRecognizer()
    {
        var installed = SpeechRecognitionEngine.InstalledRecognizers();
        var info = installed.FirstOrDefault(r => r.Culture.Name == CultureInfo.CurrentUICulture.Name && r.Culture.TwoLetterISOLanguageName == "en")
                   ?? installed.FirstOrDefault(r => r.Culture.Name == "en-US")
                   ?? installed.FirstOrDefault(r => r.Culture.TwoLetterISOLanguageName == "en");
        if (info is null) return null;
        var r = new SpeechRecognitionEngine(info);
        r.InitialSilenceTimeout = TimeSpan.FromSeconds(6);
        r.EndSilenceTimeout = TimeSpan.FromSeconds(0.7);
        r.BabbleTimeout = TimeSpan.FromSeconds(8);
        r.SpeechHypothesized += (_, e) => Send("heard", new JsonObject { ["text"] = e.Result.Text, ["final"] = false });
        r.SpeechRecognized += (_, e) => Send("heard", new JsonObject { ["text"] = e.Result.Text, ["final"] = true });
        // Not sure what it heard: still pass on its best guess, so the robot can answer instead of going quiet.
        r.SpeechRecognitionRejected += (_, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Result?.Text)) Send("heard", new JsonObject { ["text"] = e.Result.Text, ["final"] = true });
        };
        r.RecognizeCompleted += (_, e) =>
        {
            _listening = false;
            if (e.InitialSilenceTimeout) Send("voiceError", new JsonObject { ["message"] = "I didn't hear anything. Tap the microphone and try again." });
            Send("listening", new JsonObject { ["on"] = false });
        };
        r.AudioLevelUpdated += (_, e) => Send("level", new JsonObject { ["value"] = e.AudioLevel / 100.0 });
        return r;
    }

    /// <summary>Builds the command grammar from the words the game sends (robot name, parts, colours).</summary>
    private void LoadGrammars(JsonNode? phrases)
    {
        var key = phrases?.ToJsonString() ?? "";
        if (key == _grammarKey && _recognizer!.Grammars.Count > 0) return;
        _grammarKey = key;
        var r = _recognizer!;
        r.UnloadAllGrammars();

        string[] Words(string name) => phrases?[name]?.AsArray().Select(n => (string?)n).OfType<string>().Where(s => s.Length > 0).ToArray() ?? [];
        var names = Words("names");
        var things = Words("parts").Concat(Words("slots")).Distinct().ToArray();
        var colors = Words("colors").Distinct().ToArray();

        var commands = new Choices(
            "move it in", "move it out", "push it in", "pull it out", "a little more", "closer", "lock it", "lock it on", "attach it",
            "weld it", "confirm", "yes", "another one", "next one", "show me another", "put it back", "never mind", "spin it",
            "turn it around", "stop", "test walk", "power up", "power down", "what's missing", "build it all", "start over",
            "exploded view", "put it back together", "tell me a joke", "help", "thank you", "hello", "zoom in", "zoom out", "save",
            "show me the blueprint", "print the plan", "launch", "go to the planet", "play some music", "play some jazz", "next song",
            "stop the music", "turn it up", "turn it down", "jump", "fire", "walk forward", "go back to the garage");
        var builders = new List<GrammarBuilder> { new(commands) };
        if (things.Length > 0)
        {
            var thing = new Choices(things);
            foreach (var verb in new[] { "bring me the", "get the", "show me the", "put on the", "take off the", "remove the", "look at the", "i want the", "put an", "put a" })
            {
                var b = new GrammarBuilder(verb);
                b.Append(thing);
                builders.Add(b);
            }
        }
        if (colors.Length > 0)
        {
            var color = new Choices(colors);
            foreach (var verb in new[] { "paint it", "make it", "paint the trim", "make the eyes", "make the lights" })
            {
                var b = new GrammarBuilder(verb);
                b.Append(color);
                builders.Add(b);
            }
        }
        var all = new Choices(builders.ToArray());
        var withName = new GrammarBuilder();
        if (names.Length > 0) withName.Append(new Choices(names.SelectMany(n => new[] { n, "hey " + n, "ok " + n, "okay " + n }).ToArray()), 0, 1);
        withName.Append(all);
        r.LoadGrammar(new Grammar(withName) { Name = "commands", Priority = 10 });
        r.LoadGrammar(new DictationGrammar { Name = "dictation", Priority = 0, Weight = 0.4f });
    }

    // ---------------------------------------------------------------- talking

    private SpeechSynthesizer Voice()
    {
        if (_voice is not null) return _voice;
        _voice = new SpeechSynthesizer();
        _voice.SetOutputToDefaultAudioDevice();
        var voices = _voice.GetInstalledVoices().Where(v => v.Enabled).Select(v => v.VoiceInfo).ToList();
        var pick = voices.FirstOrDefault(v => v.Culture.Name == "en-US" && v.Gender == VoiceGender.Female)
                   ?? voices.FirstOrDefault(v => v.Culture.TwoLetterISOLanguageName == "en");
        if (pick is not null) _voice.SelectVoice(pick.Name);
        _voice.SpeakCompleted += (_, _) => Send("spoken");
        return _voice;
    }

    /// <summary>The voices Windows has, for the voice picker in Settings.</summary>
    public void ListVoices()
    {
        var list = new JsonArray();
        foreach (var v in Voice().GetInstalledVoices().Where(v => v.Enabled).Select(v => v.VoiceInfo))
            list.Add(new JsonObject { ["id"] = v.Name, ["name"] = v.Name.Replace("Microsoft ", "").Replace(" Desktop", ""), ["lang"] = v.Culture.Name });
        Send("voices", new JsonObject { ["list"] = list });
    }

    public void Speak(string text, string? voiceName)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        var v = Voice();
        if (!string.IsNullOrEmpty(voiceName))
        {
            try { v.SelectVoice(voiceName); } catch (ArgumentException) { /* that voice is gone: keep the current one */ }
        }
        v.SpeakAsyncCancelAll();
        v.SpeakAsync(text);
    }

    public void StopSpeaking() => _voice?.SpeakAsyncCancelAll();

    public void Dispose()
    {
        _modern?.Dispose();
        _recognizer?.Dispose();
        _voice?.Dispose();
    }
}
