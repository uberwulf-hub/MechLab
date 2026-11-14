using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MechGarage.Windows;

/// <summary>
/// Mech Garage for Windows: one window showing the game (the web folder next to the .exe) in WebView2, plus Windows'
/// own offline speech recognition and voice, so the robot helper can hear and talk. See web/js/voice.js for the messages.
/// </summary>
internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new GameWindow());
    }
}

internal sealed class GameWindow : Form
{
    private const string Host = "garage.local";
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(7, 9, 12) };
    private readonly Speech _speech;
    private FormWindowState _before = FormWindowState.Maximized;

    public GameWindow()
    {
        Text = "Mech Garage";
        BackColor = Color.FromArgb(7, 9, 12);
        MinimumSize = new Size(960, 600);
        Size = new Size(1600, 900);
        StartPosition = FormStartPosition.CenterScreen;
        // Full screen with no title bar: the game has its own Exit button (and Alt+F4 still works). F11 switches to a window.
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        KeyPreview = true;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { /* keep the default */ }
        Controls.Add(_web);
        _speech = new Speech(Post);
        Load += async (_, _) => await StartAsync();
        KeyDown += (_, e) => { if (e.KeyCode == Keys.F11) ToggleFullScreen(); };
        FormClosed += (_, _) => _speech.Dispose();
    }

    private async Task StartAsync()
    {
        var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MechGarage", "WebView2");
        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null, data);
            await _web.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(this,
                "Mech Garage needs the Microsoft Edge WebView2 Runtime, which comes with Windows 11 and most Windows 10 PCs.\n\n" +
                "Install it from microsoft.com/edge/webview2 (the \"Evergreen Bootstrapper\"), then open Mech Garage again.",
                "Mech Garage", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
            return;
        }

        var core = _web.CoreWebView2;
        var web = Path.Combine(AppContext.BaseDirectory, "web");
        core.SetVirtualHostNameToFolderMapping(Host, web, CoreWebView2HostResourceAccessKind.DenyCors);
        core.Settings.AreDevToolsEnabled = System.Diagnostics.Debugger.IsAttached;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        // The game never leaves its own folder.
        core.NavigationStarting += (_, e) =>
        {
            if (!e.Uri.StartsWith($"https://{Host}/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
        };
        core.NewWindowRequested += (_, e) => e.Handled = true;
        core.WebMessageReceived += (_, e) => OnMessage(e.TryGetWebMessageAsString());
        core.Navigate($"https://{Host}/index.html");
    }

    private void OnMessage(string? json)
    {
        if (json is null) return;
        JsonNode? msg;
        try { msg = JsonNode.Parse(json); } catch (JsonException) { return; }
        switch ((string?)msg?["type"])
        {
            case "listen":
                _speech.Listen(msg?["phrases"]);
                break;
            case "stopListening":
                _speech.StopListening();
                break;
            case "speak":
                _speech.Speak((string?)msg?["text"] ?? "", (string?)msg?["voice"]);
                break;
            case "stopSpeaking":
                _speech.StopSpeaking();
                break;
            case "voices":
                _speech.ListVoices();
                break;
            case "quit":
                Close();
                break;
            case "minimize":
                WindowState = FormWindowState.Minimized;
                break;
            case "fullscreen":
                ToggleFullScreen();
                break;
        }
    }

    /// <summary>Sends a message to the page (from any thread).</summary>
    private void Post(JsonObject message)
    {
        if (IsDisposed) return;
        var json = message.ToJsonString();
        BeginInvoke(() => _web.CoreWebView2?.PostWebMessageAsString(json));
    }

    private void ToggleFullScreen()
    {
        if (FormBorderStyle == FormBorderStyle.None)
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            WindowState = _before;
        }
        else
        {
            _before = WindowState;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Normal; // re-maximise so it covers the taskbar
            WindowState = FormWindowState.Maximized;
        }
    }
}
