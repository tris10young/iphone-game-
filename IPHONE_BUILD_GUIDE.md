# Getting Skyward onto your iPhone

This guide assumes you have never done any of this before. Nothing is skipped.

The game is a web game. There is nothing to compile, no Xcode, no Apple
Developer account, and no App Store review. You put the files somewhere your
phone can reach and you open a link. Total time for the first run: about five
minutes.

Pick **one** of the three options below.

- **Option A — Same Wi-Fi.** Fastest. Best while you are still changing things.
- **Option B — A public link.** Best for showing other people.
- **Option C — Add to Home Screen.** Do this *after* A or B. It makes the game
  fullscreen with its own icon, so it looks and feels like a real app.

---

## Option A — Run it from your Mac or PC over Wi-Fi

Your phone and your computer must be on the **same Wi-Fi network**.

### 1. Install Node.js (one time only)

Go to <https://nodejs.org> and download the **LTS** version. Run the installer
and accept the defaults.

To check it worked, open a terminal (**Terminal** on Mac, **PowerShell** on
Windows) and type:

```
node --version
```

You should see something like `v22.x.x`. If you see "command not found", close
the terminal, open a new one, and try again.

### 2. Start a web server in the game folder

In the terminal, move into the project folder. On Mac, type `cd ` (with a
space), then drag the project folder onto the terminal window and press Enter.

Then run:

```
npx --yes http-server -p 8080
```

Leave this window open. The game is now being served for as long as it runs.
You will see output like this:

```
Available on:
  http://127.0.0.1:8080
  http://192.168.1.42:8080
```

**Write down the second address** — the one that is *not* `127.0.0.1`. That is
your computer's address on your Wi-Fi network. Yours will have different
numbers.

### 3. Open it on the iPhone

On your iPhone, open **Safari** and type that address into the address bar, for
example:

```
http://192.168.1.42:8080
```

The title screen appears. **Tap once** to start.

> That first tap is required and not decorative — iOS refuses to let any web
> page play audio until the user has deliberately touched it. The tap is what
> switches the sound on.

### If it does not load

- **"Safari cannot open the page"** — the two devices are not on the same
  network. Check your iPhone is on Wi-Fi and not mobile data, and that it is on
  the same network name as your computer.
- **Still nothing** — your computer's firewall is blocking the connection. On
  Mac: System Settings → Network → Firewall → Options → allow incoming
  connections for Node. On Windows, approve the prompt Windows shows the first
  time you run the server.
- **You typed `https`** — it must be `http`. There is no certificate here.

---

## Option B — Put it on the internet with a public link

Use this to send the game to someone else, or to load it on your phone from
anywhere. It is free.

### GitHub Pages

1. Push this repository to GitHub.
2. On GitHub, open the repository and go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Choose your branch and the folder **`/ (root)`**. Click **Save**.
5. Wait one to two minutes, then reload the Settings → Pages screen. It will
   show your link, in the form
   `https://<your-username>.github.io/<repository-name>/`.
6. Open that link in Safari on your iPhone.

Everything the game needs is committed to the repository, including the 3D
library, so there is no build step to configure.

### Netlify Drop (no account, no Git)

1. On your computer, go to <https://app.netlify.com/drop>.
2. Drag the whole project folder onto the page.
3. It gives you a public link within seconds. Open it on your iPhone.

Do **not** drag the `node_modules` folder if you have one — it is not needed and
will make the upload enormous. It is already excluded by `.gitignore`.

---

## Option C — Make it a real app on the Home Screen

Do this once you have the game open in Safari using Option A or B. It removes
the browser bars, runs the game fullscreen, gives it an icon, and locks it to
portrait.

1. With the game open in **Safari** (this does not work in Chrome on iOS), tap
   the **Share** button — the square with an arrow pointing up, in the bottom
   toolbar.
2. Scroll down the list and tap **Add to Home Screen**.
3. Name it (it will suggest "Skyward") and tap **Add**.
4. Close Safari. Tap the new icon on your Home Screen.

It now launches fullscreen with no browser interface at all.

> If you used Option A, this Home Screen icon only works while your computer is
> running the server and both devices are on the same Wi-Fi. For an icon that
> works anywhere, use Option B first.

---

## Playing it

| You do | What happens |
| --- | --- |
| Tap the stone | The traveller walks there |
| Drag one finger sideways | The whole level rotates, with weight and inertia |
| Drag one finger up or down | The camera tilts, within limits |
| Pinch | Zoom in and out, clamped so you cannot lose the level |
| Tap a mechanism | It activates |

The route to the portal is broken in three places. You need the rotating tower,
the sliding bridge, and the elevator. No instructions appear unless you have
been still for a few seconds.

The small button in the top-right corner pauses, restarts, and toggles sound and
quality.

---

## Changing the game and seeing the result

There is no build step and no bundler. Edit a file, save it, and pull down to
refresh in Safari. That is the entire loop.

If a change does not appear, Safari has cached the old file. On the iPhone:
**Settings → Safari → Clear History and Website Data**. Or, while developing,
use a private browsing tab, which does not cache as aggressively.

### Testing on the computer first

Open `http://localhost:8080` in Chrome or Safari on your computer. Everything
works with a mouse: click to move, click and drag to rotate, scroll wheel is not
used but trackpad pinch is. This is much faster than reaching for the phone
after every change.

To simulate the phone exactly, open Chrome DevTools (F12), click the small
phone/tablet icon in the top-left of the panel, and pick "iPhone 14 Pro" from
the device list.

### Watching performance on the real device

1. On the iPhone: **Settings → Safari → Advanced → Web Inspector → on**.
2. Connect the iPhone to a Mac with a cable.
3. On the Mac, open Safari → **Develop** menu → your iPhone's name → the page.

You get a full console and a timeline recording. If the Develop menu is missing,
turn it on in Safari → Settings → Advanced → "Show features for web developers".

---

## Troubleshooting

**The screen is black, or says "WebGL unavailable".**
Turn off Low Power Mode — iOS restricts WebGL when the battery is low. Then
force-quit Safari and reopen.

**It stutters.**
Open the corner menu and switch **Quality** to `low`. That drops the bloom pass,
halves the shadow resolution, caps the pixel ratio, and thins the clouds. On an
iPhone 11 or newer, `high` should hold 60fps.

**There is no sound.**
Check the mute switch on the side of the phone — iOS honours it for web audio.
Then check **Sound** in the corner menu. If you opened the game and never tapped
the title screen, audio was never unlocked; reload and tap once.

**The game is squashed, or the top is under the Dynamic Island.**
Reload the page. If it persists after adding to the Home Screen, delete the
icon and add it again — iOS caches the display settings at the moment you add
it.

**Nothing happens when I tap the elevator.**
That one is deliberate. You have to be standing on the platform before its
mechanism will answer. Walk onto the pad first, then tap the pedestal.
