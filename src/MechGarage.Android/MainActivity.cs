using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Views;
using Android.Webkit;
using AndroidX.WebKit;

namespace MechGarage.Android;

/// <summary>
/// The whole game is one screen: the game's web folder (packed in the app) in a web view, served from
/// https://appassets.androidplatform.net/ so its modules load, plus window.MechGarageAndroid for speech (see GarageBridge).
/// </summary>
[Activity(Label = "Mech Garage", MainLauncher = true, LaunchMode = LaunchMode.SingleTask, Exported = true,
    ScreenOrientation = ScreenOrientation.FullUser,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout |
                           ConfigChanges.SmallestScreenSize | ConfigChanges.KeyboardHidden | ConfigChanges.UiMode)]
public class MainActivity : Activity
{
    public const string Origin = "https://appassets.androidplatform.net";
    internal const int MicRequest = 7;
    private WebView _web = null!;
    private GarageBridge _bridge = null!;

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        Window?.AddFlags(WindowManagerFlags.KeepScreenOn);

        _web = new WebView(this);
        _web.SetBackgroundColor(global::Android.Graphics.Color.ParseColor("#07090C"));
        var s = _web.Settings;
        s.JavaScriptEnabled = true;
        s.DomStorageEnabled = true;          // the saved mech lives in localStorage
        s.MediaPlaybackRequiresUserGesture = false;
        s.AllowFileAccess = false;
        s.AllowContentAccess = false;
        s.SetSupportZoom(false);

        var assets = new WebViewAssetLoader.Builder()
            .AddPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .Build();
        _web.SetWebViewClient(new GarageWebClient(assets));
        _bridge = new GarageBridge(this, _web);
        global::Android.Util.Log.Info("MechGarage", "Starting the game page");
        _web.AddJavascriptInterface(_bridge, "MechGarageAndroid");
        SetContentView(_web);
        HideSystemBars();

        if (savedInstanceState is not null) _web.RestoreState(savedInstanceState);
        else _web.LoadUrl($"{Origin}/assets/web/index.html");
    }

    private void HideSystemBars()
    {
        try { HideSystemBarsCore(); }
        catch (Exception e) { global::Android.Util.Log.Warn("MechGarage", $"Couldn't go full screen: {e.Message}"); }
    }

    private void HideSystemBarsCore()
    {
        if (Window is null) return;
        if (Build.VERSION.SdkInt >= BuildVersionCodes.R)
        {
            Window.SetDecorFitsSystemWindows(false);
            Window.InsetsController?.Hide(WindowInsets.Type.SystemBars());
            if (Window.InsetsController is not null)
                Window.InsetsController.SystemBarsBehavior = (int)WindowInsetsControllerBehavior.ShowTransientBarsBySwipe;
        }
        else
        {
#pragma warning disable CA1422 // still used before Android 11
            Window.DecorView.SystemUiFlags = SystemUiFlags.Fullscreen | SystemUiFlags.HideNavigation | SystemUiFlags.ImmersiveSticky | SystemUiFlags.LayoutStable;
#pragma warning restore CA1422
        }
    }

    public override void OnWindowFocusChanged(bool hasFocus)
    {
        base.OnWindowFocusChanged(hasFocus);
        if (hasFocus) HideSystemBars();
    }

    protected override void OnSaveInstanceState(Bundle outState)
    {
        base.OnSaveInstanceState(outState);
        _web.SaveState(outState);
    }

    protected override void OnPause()
    {
        _bridge.Pause();
        _web.OnPause();
        base.OnPause();
    }

    protected override void OnResume()
    {
        base.OnResume();
        _web.OnResume();
    }

    protected override void OnDestroy()
    {
        _bridge.Dispose();
        base.OnDestroy();
    }

    public override void OnRequestPermissionsResult(int requestCode, string[] permissions, Permission[] grantResults)
    {
        base.OnRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MicRequest) _bridge.MicPermissionAnswered(grantResults.Length > 0 && grantResults[0] == Permission.Granted);
    }
}

/// <summary>Serves the game's files and keeps the web view inside the game.</summary>
internal sealed class GarageWebClient(WebViewAssetLoader assets) : WebViewClientCompat
{
    public override WebResourceResponse? ShouldInterceptRequest(WebView? view, IWebResourceRequest? request) =>
        request?.Url is { } url ? assets.ShouldInterceptRequest(url) : null;

    public override bool ShouldOverrideUrlLoading(WebView view, IWebResourceRequest request) =>
        !(request.Url?.ToString() ?? "").StartsWith(MainActivity.Origin + "/", StringComparison.Ordinal);
}
