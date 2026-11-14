# Mech Garage

Design and build your own mech in a high-tech garage, with a robot helper you name and talk to.

- **The garage:** polished concrete, an assembly gantry with a hoist, a turntable, a curved workstation with hologram
  screens, a holo table that shows the part you picked, a parts lift, and the raw containers the mech is cut from.
- **The starter titan:** a cockpit made of four large containers, arms and legs made of two smaller
  containers and two motors each, and no head on top: the sensor is built into the body. Other cockpits, hands, tools,
  legs, packs and shoulder gear swap in.
- **The robot helper:** an arm on a floor rail. On first launch you name it. Then talk to it (microphone button) or
  type: *"Rivet, bring me the left arm"*, *"move it in"*, *"lock it on"*, *"show me another one"*, *"take off the
  right leg"*, *"paint it red"*, *"make the eyes green"*, *"spin it"*, *"test walk"*, *"what's missing?"*,
  *"build it all"*, *"call the mech Ironclad"*. It fetches each part from the lift, holds it at the socket while you
  line it up, and welds it on.
- **Hands-on too:** tap a part card to have it brought, drag a card onto the mech to fit it, drag the held part in
  towards its socket to snap it on, tap a fitted part to swap or remove it. Paint shop, exploded view, walk test.
- **Blueprint mode:** the mech drawn as a blueprint (front, side, top, 3D) with real sizes worked out from the
  containers you measure, callouts for every part, a shopping list (containers, motors, electronics, craft parts), build
  steps, tools and safety notes. **Print build plan** prints it (or saves a PDF) on Windows and Android.
- **The test planet:** launch a finished mech onto an alien planet. Walk, run, jump (and fly with jump jets), fire
  what the arms carry (blasters, punches, saws, drills), rockets, lights. Collect crystals, zap Skitters, Floaters and
  Stompers, and follow the robot helper's missions over the radio. Keyboard and mouse, touch, gamepad, or voice
  ("jump", "fire", "walk forward", "go back to the garage").
- **39 parts:** 6 cockpits, 6 sensors, 8 arms, 6 legs, 6 back packs, 7 shoulder pieces. Each changes what the mech
  can do on the planet and what the real build needs.
- **Make every part your own:** tap a fitted part and choose Customize: its own colours, size, length (arms and
  legs), a label stencilled on its containers, and a nickname. Or say "make the left arm bigger", "paint the legs red",
  "call the left arm Big Bertha", "write TITAN on the cockpit".
- **The boombox** on the desk plays smooth jazz, made live in code by a little band (electric piano, walking bass,
  brushed drums, sax or vibraphone): five original tunes that take turns. Tap it for controls, or ask the helper:
  "play some jazz", "next song", "turn it up", "stop the music".
- **Full screen, no title bar** on Windows. **Exit** (top right, or Esc) opens the pause menu: back to the garage,
  window mode, minimize, or exit the game. F11 switches between full screen and a window.
- **Garage camera:** W A S D or the arrow keys move around, Q and E turn, drag to orbit, scroll to zoom.
- **Saves itself** on the device. Speech stays on the device too: Windows and Android speech engines, no internet.

## How it's built
| Folder | What |
|---|---|
| `web/` | The game: Three.js (bundled, MIT) and plain JavaScript modules. Every model, texture and sound is made in code. |
| `src/MechGarage.Windows/` | Windows app: a window with WebView2 showing `web/`, plus Windows speech recognition and voice (`Speech.cs`). |
| `src/MechGarage.Android/` | Android app: a WebView showing `web/` from the app's assets, plus Android's speech recogniser and text-to-speech. |
| `tools/Release-Game.ps1` | Builds both, signs them with your SauceStore keys, and publishes the GitHub release. |

Try it in a browser while working on it (Chrome or Edge; the microphone works there too):

```bash
cd web && python3 -m http.server 8765
```

Then open http://localhost:8765. Tests: `node --test tests/brain.test.mjs tests/plans.test.mjs`.

## Releasing to SauceStore
GitHub builds, signs and publishes every release, the same way as SauceStore itself:

1. Bump `<Version>` in `src/MechGarage.Version.props` and write `release-notes/v<version>.md` (one change per line:
   "Added …", "Fixed …", "Known issue: …"). Commit and push.
2. Start it: **Actions > Release > Run workflow** on GitHub (works from a phone), or `./tools/Release-Game.ps1`.
3. GitHub builds `MechGarage-windows.zip` and `MechGarage-android.apk`, signs the Android app, and publishes release
   `v<version>`. SauceStore lists it within about 10 minutes.

**Android key (once):** run `./tools/New-AndroidKey.ps1` on your PC. It makes the permanent signing key in
`SauceStore Keys` with a random password and prints three repository secrets to add (Settings > Secrets and
variables > Actions): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`. Back up the
key file and the password. Releases are signed on GitHub with it; the key never goes in the repo, and pull requests
from other people can't read secrets.

**Windows:** unsigned unless you add the `WINDOWS_PFX_BASE64` and `WINDOWS_PFX_PASSWORD` secrets (your family
certificate), like SauceStore.

Every push also runs **Build**: the tests plus unsigned Windows and Android builds, to catch problems early.

## Licence
The code is public to read, but all rights are reserved: see [LICENSE](LICENSE).
