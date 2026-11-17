# MiraX-style IPTV Player

An HLS (`.m3u8`) IPTV player built with Next.js (App Router), React, TypeScript, Tailwind CSS, hls.js and zustand. Its interface is modeled on a set-top-box receiver: a blue tiled home menu, a channel list, and a live info bar.

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
```

A built-in sample playlist of public test streams loads on first start. It includes one deliberately dead channel so you can see the "No Signal" state.

## Loading a playlist

Open the menu (**M**), select **Installation** and press **OK**. From there you can:

- **URL**: paste an M3U/M3U8 URL and press Load. The playlist is fetched in the browser, so the server must allow CORS. If it doesn't, download the file and use the next option.
- **Local file**: choose a `.m3u` or `.m3u8` file from your computer.
- **Built-in sample**: reload the demo list.

The parser reads `#EXTINF` lines with `tvg-name`, `tvg-logo` and `group-title`. Channels are grouped by `group-title`. The last playlist and last channel are saved in `localStorage` and restored on the next visit.

## How streams are played

Browsers can only play streams from servers that allow cross-site requests (CORS), and most IPTV providers don't. The app includes a local proxy at `app/api/proxy/route.ts` that gets around this. For each channel the player tries these in order:

1. **HLS direct**: hls.js loads the stream straight from the provider.
2. **HLS via proxy**: the stream goes through `/api/proxy`, which adds CORS headers and rewrites the URLs inside the playlist.
3. **MPEG-TS via proxy**: used for raw `.ts` and Xtream-style `http://host:port/user/pass/123` links. These are played with mpegts.js.

When a link has no file extension, the proxy checks the first bytes of the stream to tell which kind it is. The proxy sends a VLC User-Agent by default; set `IPTV_USER_AGENT` to change it. If a channel still fails, the No Signal screen shows the exact reason.

For MPEG-TS links, the probe also reads the stream's codec table:

- **MP2 audio** (MPEG-1 Layer II, common on channels taken from DVB broadcasts) can't be decoded by browsers.
  - If **ffmpeg** is installed, `/api/transcode` converts only the audio to AAC and passes the video through unchanged.
  - Without ffmpeg, the proxy removes the MP2 track (`&strip=mp2`). The channel then plays without sound and a 🔇 note appears on screen.
- **Installing ffmpeg** on Windows: run `winget install Gyan.FFmpeg`. The app finds it automatically within about 30 seconds, with no restart needed. You can also set `FFMPEG_PATH` to point at the binary.
- **MPEG-2 video** can't be decoded by any browser, and many browsers can't decode HEVC/H.265 either. These channels show the exact reason on the No Signal screen.

## Controls (keyboard / remote)

| Where | Key | Action |
|---|---|---|
| TV | ▶ / PgUp / + | Next channel |
| TV | ◀ / PgDn / − | Previous channel |
| TV | ▲ / ▼ | Volume up / down (shown on screen, remembered; unmutes if muted) |
| TV | OK (Enter) | Open the channel list, or retry a dead stream |
| TV | i / Esc | Toggle / hide the info bar (it hides by itself after 5 s) |
| TV | M / Home / Backspace | Open the home menu |
| List | ▲ ▼ / PgUp PgDn | Move the highlight |
| List | ◀ ▶ | Switch group |
| List | OK | Play the highlighted channel (press OK again to go fullscreen) |
| List / Menu | Esc | Go back to TV |
| Anywhere | 0–9 | Jump to a channel number |
| Anywhere | U / Mute media key | Mute or unmute (also the speaker button in the info bar, or click the corner icon) |
| TV | S | Stream stats panel |
| TV | R | Start or stop recording the current channel |

### Installation: three ways to add channels

- **M3U Playlist**: enter a URL, pick a local file, or use the built-in sample.
- **Xtream Login**: enter the server (with port), username and password. The player downloads the channel list from `get.php`, the same way as an M3U link.
- **MAC Portal** (MAG style):
  - Each browser/device gets its own random MAC address with the MAG prefix (`00:1A:79:XX:XX:XX`). It's created once and kept in that browser's storage.
  - Add that MAC as a **MAG device** in your Xtream UI panel, enter the portal URL (usually `http://server:port/c/`), and press Connect.
  - The player speaks the Stalker portal protocol: handshake, profile, genres and channels.
  - Portal stream links expire, so channels point at `/api/stalker/play`, which gets a fresh link each time you tune or record.
  - A different browser, or clearing site data, gives a new MAC, which you'd have to add to the panel again.
  - The CA screen shows the MAC, the portal, and the expiry date the portal reports.

### Home menu screens

- **Live preview**: select it with the arrow keys and press OK to watch that channel full screen.
- **Channel Manager**: rearrange your channels.
  - Press **OK** to pick up a channel. Move it with ▲▼ or PgUp/PgDn, then press **OK** again to drop it.
  - To send a channel straight to a position, pick it up, type the number, and press **OK**.
  - **D** deletes a channel and **R** restores the playlist's original order. **P** plays the highlighted channel.
  - Changes are saved per playlist.
- **Installation**: load a playlist.
- **Settings**:
  - Info bar duration, clock format, and start screen.
  - Stream conversion: Automatic, Always or Off.
  - Playlist loader, forget learned stream methods, reset channel order, and factory reset.
- **PVR Manager**: record channels with ffmpeg. Requires ffmpeg.
  - **N** records the current channel now, and **T** sets a timer (channel, day, start time and length).
  - In the list, **OK** plays a finished recording or stops one in progress. **D** pressed twice deletes it.
  - While watching TV, **R** starts or stops recording the current channel, and a ● REC badge shows while it records.
  - Recordings are saved as MP4 in `recordings/` (change it with `RECORDINGS_DIR`). The recording is written as fragmented MP4, so a crash keeps what was captured. When it finishes it's remuxed so it can be seeked.
  - Channels that needed full conversion for live playback are recorded converted to 720p, so they play back in the browser.
  - Timers only fire while `npm run dev` / `npm start` is running. A timer missed while the server was off is marked "Missed".
  - The recordings index (`recordings/index.json`) stores the stream URLs, which can contain your IPTV credentials. Keep that folder private. It's already in `.gitignore`.
- **File List**: browse **Recordings**, your **Videos** folder (change it with `MEDIA_DIR`), or **This computer** (file picker).
  - MP4 and WebM play directly with seeking. Other formats such as MKV, AVI and TS fall back to ffmpeg conversion, which can't seek.
  - `.m3u` files load as your playlist.
  - Only files inside those folders are reachable.
- **Playing a recording or file**:
  - **OK** pauses or plays.
  - **◀▶** seek 10 s, **▲▼** 1 min and **PgUp/PgDn** 10 min.
  - **Esc** returns to where you came from, and live TV resumes.
- **CA**: shows the playlist name and channel count. For Xtream-Codes playlists it also shows the account status, expiry date, days left, connection limit and creation date. These come from the provider's `player_api.php`. **R** refreshes them.

Deep links: `/#home`, `/#list`, `/#manager`, `/#settings`, `/#ca`, `/#pvr` and `/#files` open a screen directly.

Mouse also works: click the tiles, click a row to highlight it, double-click to play it.

## Customizing

- **Colors and gradients**:
  - Home tiles: `TILES` in `components/HomeMenu.tsx`
  - Background art: the same file
  - List colors: `components/ChannelList.tsx` (cyan highlight `#16c6f2`, header `#5fdcff`)
  - Info bar: `components/InfoBar.tsx`
- **Font**: `--font-receiver` in `app/globals.css`.
- **Logo / title**: the `metadata` in `app/layout.tsx`. To add a logo, put an image in `public/` and render it in `HomeMenu.tsx`.
- **Layout**: everything is placed in percentages and `cqw` units on a 16:9 stage (`components/Receiver.tsx`), so it scales with the window.
- **Tile and video positions**: `POS` in `HomeMenu.tsx` and `RECTS` in `VideoPlayer.tsx`.
- **No-signal timeout and info-bar hide time**: `NO_SIGNAL_TIMEOUT_MS` in `VideoPlayer.tsx` and `AUTO_HIDE_MS` in `InfoBar.tsx`.

## Structure

```
app/            layout, page, globals.css
components/
  Receiver.tsx      16:9 stage, view switching, key handling
  HomeMenu.tsx      blue tiled main menu
  ChannelList.tsx   group list with preview and hint bar
  VideoPlayer.tsx   one persistent <video>; hls.js loaded dynamically, native HLS on Safari/iOS
  InfoBar.tsx       info bar shown on channel change
  PlaylistLoader.tsx  Installation dialog (URL / file / sample)
lib/
  m3u.ts    M3U parser and grouping
  store.ts  zustand store (channels, current channel, view, playback state, persistence)
  sample.ts built-in demo playlist
```

## Phone and PC: two interfaces

The app looks at the device it's running on and picks the right interface:

| Device | Interface |
|---|---|
| Phone or tablet (touch-first: the main pointer is a finger and nothing can hover) | **Phone layout**, touch gestures |
| PC / laptop (mouse + keyboard) | **TV layout**, keyboard controls only |

- **Override** it under **Settings › Interface** (Auto / Phone / TV) in either layout, or with `?ui=phone` / `?ui=tv` in the address.
- A touchscreen laptop whose main pointer is a mouse still gets the TV layout.

### Phone layout

- **Picture on top**, with a "now playing" strip under it: previous, next, mute, record and full screen as big touch buttons.
- **Four tabs:**
  - **Channels:** search, group chips, and a list with logos. Tap a channel to play it. The pencil switches on reordering and deleting.
  - **Recordings:** record now, set a timer (native date and time pickers), play, stop and delete recordings, and play a video from the phone.
  - **Playlist:** the subscription card (expiry, days left) plus M3U, Xtream login and MAC portal forms, with this phone's MAC address.
  - **Settings:** stream conversion, audio processing, layout, and maintenance.
- **Full screen:**
  - Turn the phone sideways for a full-screen player, or use the full-screen button.
  - **Rotate** button (in the strip under the picture, and on the picture when you tap it):
    - On Android Chrome it goes full screen and locks the display to landscape.
    - On an iPhone, where browsers can't lock the screen, the picture is turned sideways inside the app, and you turn the phone to match.
    - Gestures, controls and the channel drawer all follow the rotation. The back arrow returns to portrait.
    - Turning the phone sideways for real switches to the normal landscape view.
  - Tap the picture for controls: previous and next channel, mute, record, and a channel drawer.

**Gestures on the picture**

| Gesture | Live TV | Recording / file |
|---|---|---|
| Swipe left / right | Next / previous channel (a label follows your finger) | Seek |
| Drag up / down | Volume (a pill shows the level; unmutes if muted) | Volume |
| Tap | Show or hide the controls | Show or hide the controls |
| Double-tap | Mute / unmute | Left or right side jumps 10 s, centre pauses |

**Phone details**

- The page can't be pinch-zoomed or pulled to refresh, so gestures don't fight the browser.
- The screen stays awake while the app is open.
- Add it to your Home Screen to install it as an app (`app/manifest.ts`).
- Full screen locks landscape where the browser allows it. iPhones don't allow it, so rotate the phone instead.

### Getting clean playback on a phone

Phones are much stricter than PCs about video. Raw IPTV streams are often interlaced HD with MP2 audio, which phones either draw with **green lines** or play **without sound**. The fix is for the server to convert the stream, and that needs **ffmpeg** on the machine running the app.

- **Converted automatically.** With Stream conversion on **Automatic**, the phone layout converts raw TV streams to clean 720p H.264 + AAC whenever the server has ffmpeg. The tags under the picture then show H264 · AAC.
- **Run it on your own PC.** This is the easy way to get ffmpeg:
  1. Install ffmpeg (`winget install Gyan.FFmpeg`).
  2. Run `npm run lan` instead of `npm run dev`.
  3. On your phone (same Wi-Fi), open `http://<your-PC-IP>:3001`.
  4. Add the page to your Home Screen if you like.
  Over plain `http://` the browser disables the "keep screen on" feature, but everything else works.
- **Vercel can't do this.** Vercel has no ffmpeg and limits how long a stream can run. On a Vercel deployment, channels with MP2 audio have no sound and interlaced channels can show green lines. The phone layout warns you when the server has no ffmpeg. To host it online, use a server that allows ffmpeg and long-running connections (a VPS or Docker host).

### TV layout (PC)

Keyboard (and mouse) only. There are no touch gestures and no on-screen remote on a PC. The controls are in the table above.

## Audio troubleshooting

- **Stats panel:** press **S** while watching. It shows the playback method, the codecs, the buffer, and whether audio is actually being decoded.
- **Audio watchdog:** on Chrome/Edge, if the picture keeps moving but no audio is decoded for about 6 seconds, the player switches to the next method automatically. The last option is ffmpeg's audio→AAC conversion.
- **Settings › Audio processing › Always via ffmpeg:** sends every live channel's audio through ffmpeg. The video is copied untouched and the audio is cleaned and converted to AAC, using little CPU. Use it if sound still drops out or crackles on some channels.
- **ffmpeg audio filtering:** it uses `aresample=async=1` with `+genpts+discardcorrupt`, so audio timestamp gaps from the provider are filled instead of causing dropouts.
