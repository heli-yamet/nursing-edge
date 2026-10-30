# Networked Electromechanical HID Rig

**A device that receives keyboard and mouse events over a network and reproduces them by physically actuating a real keyboard and a real mouse.**

Full development flow: architecture, physics, BOM, firmware, protocol, schedule, blockers.

Target configuration (per your selections):

| Choice | Selected |
|---|---|
| Keyboard | Full 104-key solenoid array |
| Mouse | XY stage moving the physical mouse |
| Use case | Remote operation of an air-gapped machine |
| Priorities | Latency, reliability, unattended uptime |

---

## 0. Read this before you spend any money

The rig you described is a **physical HID injector**. It is the correct answer to exactly one requirement: *"the target computer must have no electrical connection to anything but its own keyboard and mouse."*

If that requirement is not absolute, a USB HID gadget (PiKVM, TinyPilot, Sipeed NanoKVM, or a bare Pi Zero in gadget mode) does everything this rig does, for ~$60 instead of ~$2,000, with 1 ms latency instead of 25 ms, in a week instead of six months, and with zero mechanical failure modes. §12 covers the alternatives properly.

Assume you have the absolute requirement, since you named an air-gapped host. Two things follow, and they shape the whole design:

1. **Once this rig is installed, the machine is no longer air-gapped in the sense that matters.** A network-reachable device that can type arbitrary text into a console and read the screen back is a full bidirectional bridge across the gap; the physical actuation only removes USB as an attack surface on the *target*, it does not remove the bridge. This has to be a sanctioned, documented, monitored control before you build it, not a surprise you present to a security team afterward. §11 covers the controls that make it defensible.
2. **You need a video return path**, and it is not optional. Typing blind into an air-gapped console is not remote control. §7 covers it. Budget as much engineering time for the return path as for the keyboard.

---

## 1. System architecture

```
 OPERATOR SIDE                          │              TARGET SIDE (secure area)
                                        │
 ┌──────────────┐                       │
 │ Operator app │  keyboard/mouse       │
 │ (browser or  │  events + video       │
 │  native)     │                       │
 └──────┬───────┘                       │
        │  WSS / WireGuard              │
        │  (binary frames, seq+ACK)     │
        ▼                               │
 ═══════════════ network ═══════════════╪═══════════════════════════
                                        │
                                 ┌──────┴────────────────────────┐
                                 │  GATEWAY  (Raspberry Pi 5 /   │
                                 │  fanless x86 mini PC)         │
                                 │  • TLS + session + authz      │
                                 │  • video capture & encode     │
                                 │  • visual servo loop          │
                                 │  • audit log (every event)    │
                                 └───┬──────────────────┬────────┘
                       USB CDC 1 Mb  │                  │ USB 3 UVC
                        (COBS+CRC16) │                  │
                                     ▼                  ▲
                          ┌──────────────────┐   ┌──────┴────────┐
                          │  RT CONTROLLER   │   │ HDMI capture  │
                          │  RP2040 / Teensy │   │ (MS2130 UVC)  │
                          │  • peak & hold   │   └──────▲────────┘
                          │  • motion planner│          │
                          │  • watchdog/estop│   ┌──────┴────────┐
                          └──┬────────┬──────┘   │ HDMI splitter │
                    I2C 1MHz │        │ STEP/DIR └──────▲────────┘
                             │        │                 │
             ┌───────────────▼──┐  ┌──▼─────────────┐   │
             │ 7 × PCA9685 →    │  │ 2 × TMC2209    │   │
             │ 104 × MOSFET     │  │ + 3 × servo    │   │
             └────────┬─────────┘  └──────┬─────────┘   │
                      │                   │             │
             ┌────────▼─────────┐  ┌──────▼─────────┐   │
             │ KEYBOARD         │  │ MOUSE XY STAGE │   │
             │ ACTUATOR ARRAY   │  │ + Z lift       │   │
             │ 104 solenoids    │  │ + 3 button act │   │
             │ + 3 LED sensors  │  │ + scroll drive │   │
             └────────┬─────────┘  └──────┬─────────┘   │
                      │ physically presses │ physically  │
                      ▼                    ▼ moves       │
             ┌──────────────────────────────────────┐    │
             │        TARGET COMPUTER               ├────┘
             │  (its own USB keyboard + mouse only) │  HDMI out
             └──────────────────────────────────────┘
```

**Two-brain split is deliberate.** The MCU owns anything with a hard deadline (coil timing, step pulses, watchdog, E-stop). The gateway owns anything that needs memory, TLS, or a video codec. Do not try to run the actuator timing from Linux userspace; you will get 10 ms scheduling jitter and randomly-doubled keystrokes.

---

## 2. The four physics problems that decide whether this works

Most people who attempt this build fail on one of these four. Solve them on paper first.

### 2.1 Solenoid force collapses with stroke

A Cherry MX Red needs ~0.45 N to actuate and ~0.60–0.75 N to bottom out; a membrane/rubber-dome key peaks around 0.55–0.65 N. A typical hobby solenoid — the JF-0530B, sold by Adafruit as #412 — is rated **0.5 N starting force, 5.5 mm throw, 12 V, 300 mA, 40 Ω**. Naively that looks like it barely works. In practice, mounted naively, it does not work at all.

The reason: a solenoid's force is a steep function of the **internal armature air gap**, roughly *F ∝ 1/gap²*. The "0.5 N starting force" is the force at *full extension*, which is the weakest point in the curve. If you mount the actuator so the plunger has to fly 4 mm through free air before it touches the keycap, it arrives with the weakest part of its stroke doing the work, and it will miss keys intermittently — which is worse than missing them consistently.

**The fix is mechanical, and it is the single most important design decision in the build:**

- Mount each solenoid so that at rest the plunger tip **rests in contact with the keycap** (or 0.2 mm above it), with the armature already ~60–70% seated in the coil.
- The 4 mm of keycap travel then happens over the *last* 4 mm of armature travel, i.e. the strong end of the force curve.
- Use the return spring plus gravity for release; do not rely on the key spring alone to reset the plunger.
- Design target: **≥1.5 N delivered at the actuation point**, a 2.5–3× margin over a 0.6 N key. Verify with a digital force gauge on the bench in Phase 1, not with a datasheet.

If you cannot get 1.5 N in the available envelope, add a **1:2 or 1:3 lever** (a small pivoting arm with the solenoid pulling the short side). Levers trade stroke for force and cost you ~5 ms of settling time, but they turn a marginal actuator into a comfortable one. Decide lever-vs-direct in Phase 1 and never revisit it.

### 2.2 Thermal: 104 coils in a 19 mm grid will cook

At 12 V / 40 Ω a single coil dissipates **3.6 W** continuously. The array's worst case, all keys held, is **374 W in a box the size of a keyboard**. That is not a cooling problem, it is a fire.

Three mandatory mitigations, all in firmware:

1. **Peak-and-hold drive.** Full duty for a 15–25 ms pull-in window, then PWM at ~25–35 % duty to hold. Holding force needs far less current than pull-in force because the magnetic gap is now closed. Dissipation scales linearly with duty, so 30 % hold takes a coil from 3.6 W to ~1.1 W — a 3–4× reduction. Find the real minimum hold duty empirically in Phase 1; some units hold happily at 15 %.
2. **Max-simultaneous limit.** Hard cap of 6 concurrent actuators in firmware (five fingers plus a modifier is more than any real chord). Requests beyond the cap are queued, not dropped — and the queue depth is reported back to the operator. **This cap, not the PWM, is what actually saves you:** worst-case held dissipation becomes ~7 W instead of 374 W. Peak-and-hold is the refinement; the cap is the safety property.
3. **Max continuous on-time.** Any single channel forced to release after 3 s. This doubles as a key-repeat runaway guard.

Then add: aluminium mounting plate acting as a heatspreader, two 80 mm fans pulling air across the coil field, and an NTC or I²C temp sensor per driver board with a firmware cutoff at 70 °C.

### 2.3 The mouse runs out of table

The stage has finite travel. A mouse at 800 CPI covers ~31.5 counts/mm; a 250 mm axis gives ~7,900 counts, comfortably several screen widths at 1:1 — until drift, clamping at screen edges, and any pointer acceleration accumulate and you find the carriage parked against an endstop with the cursor mid-screen.

**Solve it the way a human does: lift the mouse.** A Z-axis servo raises the mouse 3–4 mm off the pad, past the sensor's lift-off distance (typically 1–2 mm), and the carriage re-centres with the cursor frozen. Drop, resume. This is a hard requirement, not a refinement. Without it, the rig works for about ninety seconds.

### 2.4 You cannot see the cursor, and the host may be lying about it

The rig commands *relative* motion. It has no idea where the cursor actually is. Pointer acceleration ("Enhance pointer precision" on Windows, libinput's adaptive profile on Linux) makes the relationship between counts and pixels nonlinear and velocity-dependent — and on an air-gapped host you may not be able to turn it off until you already have working control, which is the chicken-and-egg.

Two techniques, use both:

- **Corner homing.** Command a large overshoot toward the top-left (e.g. −6000, −6000 counts). The OS clamps the cursor at (0,0) regardless of acceleration. You now have a known absolute origin, obtained with zero host cooperation. Re-home before any precision click and after any idle period.
- **Visual servoing.** The video return path already gives you the framebuffer. Locate the cursor in the frame (template match on the arrow bitmap, or simply diff two frames after a small test move) and close the loop: command, observe, correct. Two or three iterations lands within a pixel or two even with acceleration enabled.

The consequence for UX is big enough that it belongs in §8: do **not** stream raw relative mouse deltas from the operator's hand. Use **click-to-target** semantics.

---

## 3. Subsystem A — Keyboard actuator array

### 3.1 Mechanical

**Lock to one keyboard model on day one.** Not a keyboard type, one specific SKU that you can buy five of and keep spares. Everything downstream — plate CAD, plunger lengths, LED sensor positions — is keyed to it. A "universal" fixture is the most reliable way to never finish this project.

Recommended target: a full-size 104-key mechanical board with a rigid steel plate, standard 19.05 mm pitch, linear switches (MX Red or equivalent), and **no** stepped/sculpted keycap profile if you can avoid it. Flat-profile (XDA/DSA) keycaps make the plunger length uniform across all rows and remove a whole class of alignment error. Swapping the keycap set is the cheapest engineering win in the entire build.

**Fixture stack, bottom to top:**

| Layer | Purpose | Notes |
|---|---|---|
| Base plate, 6 mm aluminium | Datum for everything | Keyboard bolts to it via a printed cradle |
| Keyboard cradle | Repeatable keyboard location | Two dowel pins + one clamp = kinematic; ±0.1 mm on re-seat |
| Standoffs, 4 × M5, adjustable | Sets plunger preload height | Fine thread; lock-nut once set |
| Actuator plate, 6 mm aluminium | Holds 104 solenoid bodies, heatspreader | CNC or waterjet — **not** 3D printed, see below |
| Plunger guides | Keeps each tip on its keycap centre | PTFE-lined bores, 0.1 mm clearance |
| Driver board deck | Mounts the 13 driver boards above the coils | Airflow gap 15 mm |
| Top cover + 2 × 80 mm fans | Airflow, finger guard | |

**Why the actuator plate must be machined:** you need 104 holes on a 19.05 mm grid with true position better than ±0.3 mm, held across a 450 × 170 mm span, at temperatures 20–50 °C. FDM prints move 0.5–1.5 mm across that span with humidity and heat, and the error is cumulative — the corner keys will drift off their caps within weeks. Waterjet or CNC 6061 costs ~$150–250 from an online shop and removes the single most likely long-term failure. Prototype tiles (§10 Phase 2) can absolutely be printed; the production plate cannot.

**Stagger:** rows on a standard keyboard are offset by 0.25u / 0.5u / 0.25u, and the bottom row has wide keys. Your grid is not a clean 19.05 mm lattice — export the keycap centre coordinates from the keyboard's KLE (keyboard-layout-editor) JSON and generate the drill pattern from that file programmatically. Do not measure by hand; you will get one hole wrong and find out after machining.

**Wide keys** (space, shift, enter, backspace) sit on stabilisers and tilt if struck off-centre. Strike them at the **stabiliser-balanced centre**, not the visual centre, and give space bar two solenoids driven together if a single strike proves unreliable.

### 3.2 Electrical

**Per channel:** logic-level N-MOSFET low-side switch (SI2302 / DMN3009, SOT-23, ≥2 A) + flyback diode (1N4148 is marginal at 300 mA; use SS14 or BAT54) + 100 Ω gate resistor + 100 kΩ pulldown.

**Channel expansion — use PCA9685, not shift registers.** Seven PCA9685 boards give 112 channels of independent 12-bit PWM at ~1.6 kHz over I²C. Independent per-channel PWM is what makes peak-and-hold work correctly: with a 74HC595 chain you only get a *global* output-enable PWM, which breaks the moment one key is in its 100 % pull-in window while another is in its 30 % hold window — exactly what happens on every shifted capital letter. TPIC6B595 is a lovely part but its 150 mA/channel rating is half what these solenoids draw, so it is out regardless.

I²C at 1 MHz (Fast-mode Plus), ~55 µs per channel update — negligible in the latency budget. Split the seven boards across two I²C buses so a single stuck bus cannot take out the whole keyboard.

**Power:**

| Rail | Source | Sizing |
|---|---|---|
| 12 V solenoid | Meanwell LRS-150-12 (12.5 A) | 6 concurrent × 300 mA = 1.8 A peak; 4× headroom for pull-in surge |
| Bulk capacitance | 2 × 4700 µF low-ESR at the driver deck | Absorbs the pull-in current step; without it you get rail sag and phantom releases |
| 5 V logic | Separate buck, **not** derived from the 12 V rail downstream of the coils | Coil switching noise into the MCU causes resets |
| Ground | Star ground; coil return on its own heavy conductor back to the PSU | Do not share ground traces between coil return and I²C |

**Hard-wired safety, independent of firmware:** the 12 V solenoid rail passes through a mechanical contactor driven by (a) a panel E-stop in series with (b) an MCU "enable" line that is *AC-coupled* — a charge pump that requires a continuously toggling square wave from the MCU. A crashed or halted MCU stops toggling, the charge pump decays, the contactor opens, every key releases. This is the difference between a research toy and something you leave running unattended.

### 3.3 Lock-state feedback (cheap, do it)

The rig has no idea whether the target's Caps Lock, Num Lock or Scroll Lock is on, and getting it wrong silently corrupts everything you type. Fix: three phototransistors (or one TCS3472 with light pipes) aimed at the keyboard's lock LEDs, read by the MCU, reported upstream. Five dollars of parts that eliminate an entire class of silent data corruption. Before any typed string, the controller reads actual lock state and either corrects it or adjusts the keystroke plan.

---

## 4. Subsystem B — Mouse motion rig

### 4.1 Motion

**CoreXY**, 250 × 200 mm working area. CoreXY over cartesian because both motors are frame-mounted, so the moving mass is just the carriage and the mouse — lower inertia, faster settling, no cable chain on a moving axis.

| Item | Spec |
|---|---|
| Motors | 2 × NEMA 17, 42×34 mm, 1.5 A/phase, 0.4 N·m |
| Drivers | 2 × TMC2209 (StallGuard gives you sensorless homing and jam detection for free) |
| Transmission | GT2 6 mm belt, 20 T pulleys → 80 steps/mm, 0.0125 mm/step at 1/16 microstep |
| Rails | 3 × MGN9H linear rails (2 × Y, 1 × X), not V-wheels — repeatability matters more than cost here |
| Speed / accel | 300 mm/s, 3000 mm/s² → full-bed 250 mm traverse ≈ 0.93 s |
| Repeatability target | ±0.1 mm |
| Endstops | Mechanical on X and Y; StallGuard as backup |

### 4.2 The carriage

The mouse **is not carried by** the stage — it is *pushed* by it, while its own feet slide on a fixed mousepad. Otherwise the sensor sees a surface that moves with it and reports nothing.

- **Cradle:** a printed U-shaped shuttle that captures the mouse laterally with a light spring preload. Zero lateral slop; the mouse must not rotate.
- **Z lift:** one MG90S metal-gear servo driving a small cam or scissor that raises the cradle 4 mm. 4 mm clears any consumer sensor's lift-off distance (typically 1–2 mm) with margin. Lift → recentre → drop, ~400 ms total.
- **Buttons:** 3 × micro push solenoids (or MG90S servos, quieter and gentler) on L / M / R. Same peak-and-hold treatment. Click-and-hold for drags must be explicitly supported and explicitly time-limited.
- **Scroll:** a 6 mm geared DC motor with a friction O-ring riding on the wheel, plus a magnetic encoder for closed-loop detent counting. Open-loop scroll drifts and is maddening.
- **Cable:** use a **wired** mouse with a light paracord cable and a slack loop on a spring take-up. Wireless removes drag but adds 8–15 ms and a battery you now have to keep charged 24/7 on a machine you cannot touch. Wired wins for unattended uptime.

### 4.3 Surface and calibration

Fixed hard mousepad (glass or hard cloth), bonded down. Set the mouse to a **fixed, known CPI** using its own onboard DPI button before installation, and record it — you will not be able to change it remotely. 800 or 1600 CPI is a good compromise between bed travel and precision.

Calibration procedure, run at every session start and after any lift:

1. Corner-home: overshoot to (0,0), cursor clamps.
2. Lift, recentre carriage to bed origin, drop.
3. Execute a known 1000-count move in +X; measure the cursor displacement in the captured frame; compute counts-per-pixel.
4. Repeat in +Y.
5. Store the transform; refresh it if visual servoing error exceeds 3 px.

---

## 5. Subsystem C — Controller and firmware

### 5.1 Hardware

**RT controller:** RP2040 (Pico) or Teensy 4.1. RP2040 is cheaper and its PIO blocks generate rock-steady step pulses with zero CPU; Teensy 4.1 is faster with native Ethernet if you ever want to drop the gateway. Either is fine — pick RP2040 unless you have Teensy experience.

**Gateway:** Raspberry Pi 5 (4 GB) or a fanless N100 mini PC. The N100 is worth it if you want hardware H.264 encode with headroom and a real x86 security baseline.

**Link:** USB CDC at 1 Mbps, COBS-framed with CRC16. Not UART-over-GPIO — you want the USB stack's error handling.

### 5.2 Firmware architecture (RP2040)

```
core0                                core1
─────                                ─────
USB CDC RX  → decode → validate      1 kHz control tick:
            → command queue            • solenoid state machine (per channel)
                                         IDLE → PULL_IN(20ms,100%) → HOLD(30%) → RELEASE
Telemetry TX ← status aggregator      • max-simultaneous arbiter (cap 6)
                                      • thermal check + derate
PIO0: stepper X/Y step generation     • watchdog: >250 ms silence ⇒ ALL_RELEASE + motion stop
PIO1: servo PWM (Z lift, buttons)     • enable-line charge-pump toggle
                                      • motion planner: trapezoidal, jerk-limited
```

**Non-negotiable firmware invariants:**

- `ALL_RELEASE` is reachable from any state in under 1 ms and never blocks.
- The watchdog is a hardware watchdog, and it drives the physical enable line, not a software flag.
- Commands are idempotent and sequence-numbered; a duplicated packet must not produce a duplicated keystroke.
- Every actuation is timestamped and reported upstream — the operator sees what *actually* fired, not what was requested.

### 5.3 Wire protocol

**Operator ↔ Gateway:** WebSocket over TLS 1.3, inside a WireGuard tunnel, mutual-auth with client certificates. Binary frames.

**Gateway ↔ MCU** (COBS-framed, CRC16-CCITT trailer):

```
┌────────┬────────┬────────┬─────────┬──────────────┬────────┐
│ SEQ    │ TYPE   │ LEN    │ FLAGS   │ PAYLOAD      │ CRC16  │
│ u16    │ u8     │ u8     │ u8      │ 0..64 B      │ u16    │
└────────┴────────┴────────┴─────────┴──────────────┴────────┘

TYPE  0x01 KEY_DOWN      payload: u8 keycode (HID usage ID)
      0x02 KEY_UP        payload: u8 keycode
      0x03 KEY_TAP       payload: u8 keycode, u16 hold_ms
      0x04 TYPE_STRING   payload: u8 len, bytes (gateway pre-expands to keycodes)
      0x10 MOUSE_MOVE    payload: i16 dx_counts, i16 dy_counts
      0x11 MOUSE_ABS     payload: u16 x_px, u16 y_px  (rig plans home+move+servo)
      0x12 MOUSE_BTN     payload: u8 button, u8 state
      0x13 MOUSE_SCROLL  payload: i8 detents
      0x14 MOUSE_LIFT    payload: u8 state
      0x20 HOME_ALL      payload: —
      0x21 CALIBRATE     payload: —
      0x30 HEARTBEAT     payload: u32 host_ms       (≥1 per 100 ms, mandatory)
      0x7F ALL_RELEASE   payload: —                 (also implicit on watchdog)

      0x80 ACK           payload: u16 acked_seq, u8 status
      0x81 STATUS        payload: bitfield actuators_active, u8 queue_depth,
                                  i16 temp_c[4], u8 lock_leds, u8 fault_flags
      0x82 EVENT_DONE    payload: u16 seq, u32 mcu_us  (actual fire timestamp)
```

Use **HID usage IDs**, not ASCII, on the wire. The gateway does layout translation once, in one place, where it is testable. Sending "shift+3" as a concept and letting the MCU decide is how you end up typing `#` on a UK layout when you meant `£`.

### 5.4 Latency budget

| Segment | Typical |
|---|---|
| Operator input → gateway (LAN) | 0.3 ms |
| Operator input → gateway (WAN/VPN) | 20–70 ms |
| Gateway processing + USB CDC | 1–2 ms |
| MCU decode → coil energised | <1 ms |
| **Solenoid pull-in (mechanical)** | **8–18 ms** |
| Key travel to actuation point | 2–4 ms |
| Keyboard scan + debounce | 3–8 ms |
| Target USB poll | 1–8 ms |
| **Command → keystroke registered** | **~25 ms LAN, ~60–100 ms WAN** |
| Target render → HDMI out | 8–16 ms |
| Capture + encode | 20–40 ms |
| Transport + decode + display | 30–80 ms |
| **Full closed loop (see result of action)** | **~120–250 ms** |

The mechanical stage costs you ~25 ms versus a USB HID emulator's ~1 ms. That is fine for typing, which is open-loop. It is **not** fine for dragging a cursor by hand, which is why §8's interaction model matters more than shaving milliseconds.

---

## 6. Subsystem D — Video return path

| Item | Choice | Note |
|---|---|---|
| Split | Powered HDMI splitter, 1×2 | Target keeps its monitor; second output feeds capture |
| Capture | MS2130-based USB 3 UVC, 1080p60 | The older MS2109 is 1080p30 MJPEG and adds ~40 ms — avoid |
| Encode | Hardware H.264 on Pi 5 / N100 QSV | ~20–40 ms; software x264 ultrafast if you must |
| Transport | WebRTC (low latency) or MJPEG over WSS (simple, higher bandwidth) | Start with MJPEG for the prototype, move to WebRTC |
| Fallback | Full-frame PNG on demand | For OCR verification and for terrible links |

**Data-flow direction matters for the security story.** HDMI carries video from target to capture; the only reverse channel is EDID/HPD/CEC on the splitter. Use a splitter with a fixed EDID emulator and, if your threat model warrants it, physically cut the CEC pin (pin 13) and the DDC lines downstream of the EDID emulator. Then the video path is provably one-way at the physical layer, and the *only* input to the target is a mechanical fingertip.

---

## 7. Subsystem E — Gateway and operator software

**Gateway services:**

- `session` — authn/authz, one exclusive operator at a time, idle timeout, hard session TTL.
- `layout` — HID usage ID ⇄ keycap position mapping, per keyboard model, loaded from the same KLE JSON that generated the drill pattern. One source of truth.
- `servo` — the visual closed loop: locate cursor, compute error, issue correction, converge.
- `verify` — optional OCR of a screen region to confirm typed text landed. Use for anything irreversible.
- `audit` — append-only log of every event with operator identity, timestamp, and the MCU's *actual* fire timestamp. Signed, shipped off-box.
- `video` — capture, encode, distribute.

**Operator app:** a browser page. Video canvas, an input capture layer, a status strip (actuator temps, queue depth, lock LEDs, link RTT, faults), a prominent RELEASE ALL button, and a mode selector for the interaction model below.

---

## 8. Interaction model — the biggest UX decision

Do not stream raw relative mouse deltas. At 150 ms of closed-loop latency, hand-driving a cursor is an exercise in overshoot and frustration, and every correction burns stage travel.

Offer three modes:

1. **Click-to-target (default).** The operator clicks a point on the video frame. The gateway converts frame pixels → target pixels → stage plan, executes home-if-needed + move + visual servo + click, and reports done. One round trip, lands accurately, uses minimal travel. This is how the rig should be used 95 % of the time.
2. **Nudge.** Arrow-key or scroll-wheel micro-adjustments in fixed pixel increments. For pixel-precise work where visual servoing needs help.
3. **Direct relative (expert).** Raw deltas passed through, for dragging and for applications that need continuous motion. Warn about latency; auto-lift-and-recentre when travel runs low.

For the keyboard, `TYPE_STRING` should be the primary path, not individual key events. The operator composes text in a local input box, reviews it, and sends it as a unit; the gateway expands it to a keystroke plan with correct modifier sequencing and lock-state correction, and can OCR-verify the result. Character-by-character streaming is available for interactive shells and TUIs, but batched send is what makes the rig pleasant to use and dramatically reduces error rate.

---

## 9. Safety and failure modes

| Failure | Consequence if unhandled | Mitigation |
|---|---|---|
| Network drops mid-keypress | Key held → autorepeat floods the target | 250 ms watchdog → `ALL_RELEASE`; hardware enable line via charge pump |
| MCU crash/hang | Coils stay energised, overheat | Charge-pump enable line decays → contactor opens |
| Gateway crash | Same as network drop | Same watchdog; MCU does not trust the gateway to be alive |
| Solenoid stuck mechanically | Continuous key, local heating | 3 s max-on timer; per-board thermal cutoff at 70 °C; current sense anomaly detection |
| Keyboard shifts in cradle | Every key misses or hits a neighbour | Kinematic mount + dowel pins; periodic self-test (§10 P8) types a known string and OCR-verifies |
| Stage jams / belt skips | Position lost, cursor uncontrolled | TMC2209 StallGuard, current limit, re-home on any stall, soft limits |
| Two operators connect | Conflicting commands | Exclusive session lock at the gateway |
| Power brownout | Partial actuation, indeterminate state | Bulk caps + brownout detect → `ALL_RELEASE` on recovery, then re-home |
| Lock-state divergence | Silent text corruption | Photosensors on lock LEDs, checked before every typed string |
| Operator sends destructive command | It executes | Confirmation gate on a configurable command denylist; audit log; session recording |

**Physical E-stop** on the enclosure, in series with the contactor coil, cutting the solenoid rail. Independent of every line of code you write.

---

## 10. Development flow

Nine phases. Each has an exit gate — do not start the next phase until the gate passes. The gates are what keep this from becoming a two-year project.

### P0 — Requirements and target lock · 1 week
Choose the exact keyboard SKU, mouse SKU, and target OS. Buy three of each. Measure key force with a gauge, measure travel, export the KLE JSON. Write down the acceptance criteria from §11 and get them agreed. Get the security sign-off started now — it has the longest lead time of anything in this project.
**Gate:** parts in hand, force/travel numbers measured, acceptance criteria signed.

### P1 — Single-key proof rig · 2 weeks
One solenoid, one switch, one MOSFET, one MCU. Measure delivered force vs preload height. Tune pull-in duration and hold duty. Determine direct-drive vs lever. Run **10,000 automated presses** and count misses with the keyboard plugged into a logging host.
**Gate:** 0 misses in 10,000 presses; ≥1.5 N delivered; pull-in ≤20 ms; coil steady-state temp <60 °C at the intended duty.
*This is the phase that decides whether the project is viable. Do not shorten it.*

### P2 — 3×3 tile · 3 weeks
Nine channels at true 19.05 mm pitch, printed plate (prototype only), one PCA9685, real driver board, real power rail. Test mechanical crosstalk (does firing one plunger disturb its neighbours?), electrical crosstalk, rail sag, and thermals with all nine held.
**Gate:** 9-channel chord with no crosstalk; rail sag <300 mV; plate temp <50 °C after 10 min at max allowed duty; driver board layout frozen.

### P3 — Full keyboard array · 5 weeks
Generate the drill pattern from the KLE JSON. Machine the plate. Assemble 104 channels, 13 driver boards, cradle, harness, cooling. Wide-key stabiliser handling. Lock LED sensors.
**Gate:** all 104 keys individually verified against a logging host; full alphabet + all modifiers + all chords; 60 WPM sustained for 10 minutes with zero errors.

### P4 — Mouse stage · 4 weeks *(runs parallel with P3)*
CoreXY frame, motors, drivers, cradle, Z lift, buttons, scroll. Homing, soft limits, stall detection.
**Gate:** ±0.1 mm repeatability over 100 cycles; lift-and-recentre produces zero cursor movement across 100 cycles; buttons and scroll reliable over 5,000 actuations.

### P5 — Controller and firmware · 4 weeks *(starts during P2)*
Full firmware per §5.2, protocol per §5.3, gateway skeleton, watchdog, enable line, E-stop.
**Gate:** watchdog releases all actuators within 300 ms of a yanked network cable, 50/50 trials; MCU reset during a held key results in release, not a stuck key; fuzzing the protocol produces no actuation.

### P6 — Video and operator app · 3 weeks
Splitter, capture, encode, transport, browser client, status strip.
**Gate:** end-to-end glass-to-glass latency measured (photodiode + scope, or a millisecond clock on screen) and under 250 ms.

### P7 — Integration and closed loop · 3 weeks
Corner homing, calibration routine, visual servoing, click-to-target, TYPE_STRING with lock correction and OCR verification.
**Gate:** click-to-target lands within 2 px on 100 consecutive randomly-placed targets, with host pointer acceleration *enabled*.

### P8 — Soak, security review, acceptance · 3 weeks
72-hour continuous soak. Fault injection: pull the network, pull power, jam the stage, nudge the keyboard, overheat a board. Periodic self-test (type a known string, OCR-verify, alert on mismatch). Security review and formal sign-off.
**Gate:** §11 acceptance criteria all pass; security sign-off in hand.

**Timeline:** 20 weeks on the critical path (P4 and P5 run parallel), so ~24 weeks with realistic slack. One person part-time: **6–8 months.** A two- or three-person team with the mouse stage and firmware genuinely parallel: **3–4 months.** Anyone quoting you six weeks has not built P1.

---

## 11. Acceptance criteria

Concrete, testable, and worth agreeing before you start:

- **Typing accuracy:** 10,000 random characters (full printable ASCII, including shifted and symbol keys) typed at 40 WPM with **zero** character errors, verified by a logging host.
- **Sustained rate:** ≥60 WPM for 10 minutes without thermal derate.
- **Click accuracy:** 100 consecutive click-to-target operations at random 1080p coordinates land within 2 px, with pointer acceleration enabled.
- **Latency:** command → keystroke registered ≤40 ms on LAN. Glass-to-glass ≤250 ms.
- **Watchdog:** network loss releases all actuators within 300 ms, 50/50 trials.
- **Soak:** 72 hours continuous operation, no thermal fault, no missed self-test, no re-home failure.
- **Recovery:** after a full power cycle, the rig re-homes and reaches a known good state with no operator intervention.
- **Audit:** every actuation appears in the signed log with operator identity and actual fire timestamp.

---

## 12. Blockers, ranked

Ordered by how likely they are to kill the project, not by how hard they sound.

**1. Mechanical registration.** 104 plungers must stay within ~±0.5 mm of 104 keycap centres, across a 450 mm span, through thermal cycling, indefinitely. This is the #1 killer. Mitigate with: one locked keyboard model, kinematic dowel-pin cradle, machined aluminium plate (never printed), flat-profile keycaps, and an automated self-test that catches drift before a human does. Accept that a "universal, fits-any-keyboard" version is out of scope forever.

**2. Force margin and the force-vs-stroke curve.** §2.1. Measured, not assumed, in P1. If P1 cannot hit 1.5 N, you go to levers, and that changes the plate design — which is exactly why P1 comes before the plate.

**3. Thermal density.** §2.2. Peak-and-hold + max-simultaneous + max-on-time + active cooling. All four, all in firmware, all before you power 104 channels for the first time.

**4. No feedback that a keystroke registered.** The rig is open-loop into a machine it cannot query. A missed keystroke in a shell command is a silent, potentially destructive error. Mitigate with OCR verification of typed strings, batched `TYPE_STRING` with review-before-send, confirmation gates on destructive commands, and periodic self-test. Accept the residual risk explicitly; it does not go to zero.

**5. Cursor observability and pointer acceleration.** §2.4. Corner homing plus visual servoing plus click-to-target semantics. Solvable, but it is a real software subsystem, not a weekend.

**6. Latency for interactive work.** ~150–250 ms closed loop is unavoidable — most of it is the video path, not the mechanics. Mitigate with the interaction model in §8, not by chasing milliseconds in the coil driver.

**7. Wear and consumables.** MX switches are rated 50–100 M actuations, but the solenoids are not — plan on plungers, springs and coils as consumables. Log actuation counts per channel and pre-emptively replace. Keep a full spare keyboard, pre-aligned in a spare cradle, so a swap is a five-minute job.

**8. Sourcing consistency.** 104 cheap solenoids from a marketplace listing will not be a matched set — force can vary 20 % unit to unit. Buy 120, measure them all in a jig, use the strongest on the heaviest keys (space, enter, shift), and keep the tail as spares. Buy them all in one lot from one seller.

**9. Acoustic and vibration signature.** 104 solenoids are *loud* — think 70–80 dB of clattering — and mechanically noisy in the vibration sense too. If the machine lives in an office, this matters. Damping, an enclosure, and rubber isolation feet.

**10. The security question.** §0. This is a blocker in the schedule sense: a security team that sees this for the first time in month five will stop the project. Bring them in during P0. The controls that make it defensible: sanctioned and documented, exclusive authenticated sessions with mutual TLS, signed off-box audit log with session recording, physically one-way video path, hardware E-stop with local override, and a documented decommissioning procedure. Physical actuation genuinely does remove USB HID injection and DMA attack surface on the target — that is a real security *benefit* — but it does not remove the operational bridge, and the paperwork has to say so.

**11. Build cost and time realism.** ~$2,300–2,900 all-in and 3–8 months. If either number is a problem, revisit §13 now rather than in month three.

---

## 13. Bill of materials

| Subsystem | Item | Qty | Unit | Total |
|---|---|---|---|---|
| **Keyboard** | Solenoid, JF-0530B class, 12 V (buy 120, sort) | 120 | $2–6 | $240–720 |
| | Machined 6061 plate, 450×170×6 mm, 104 holes | 1 | $200 | $200 |
| | Base plate + standoffs + hardware | 1 | $80 | $80 |
| | PCA9685 16-ch PWM boards | 7 | $4 | $28 |
| | MOSFET SI2302 / DMN3009 | 120 | $0.12 | $15 |
| | Schottky SS14 | 120 | $0.06 | $8 |
| | Custom driver PCB (13-up panel, JLCPCB) | 1 | $60 | $60 |
| | Meanwell LRS-150-12 PSU | 1 | $30 | $30 |
| | Contactor, E-stop, bulk caps, wiring, fans | 1 | $90 | $90 |
| | Keyboard (target + 2 spares) | 3 | $70 | $210 |
| | Flat-profile keycap set | 1 | $40 | $40 |
| | Lock-LED phototransistors + optics | 1 | $10 | $10 |
| **Mouse** | NEMA 17 motors | 2 | $14 | $28 |
| | TMC2209 drivers | 2 | $8 | $16 |
| | MGN9H rails (2 × 300 mm Y, 1 × 250 mm X) | 3 | $22 | $66 |
| | GT2 belt, pulleys, idlers, frame extrusion | 1 | $90 | $90 |
| | MG90S servos (Z lift + 3 buttons) | 4 | $5 | $20 |
| | Geared micro DC motor + magnetic encoder (scroll) | 1 | $18 | $18 |
| | Mouse (target + spare) | 2 | $35 | $70 |
| | Endstops, hard mousepad, printed parts | 1 | $40 | $40 |
| **Control** | RP2040 / Pico | 2 | $5 | $10 |
| | Raspberry Pi 5 4 GB + PSU + storage | 1 | $110 | $110 |
| | MS2130 HDMI capture (USB 3, 1080p60) | 1 | $30 | $30 |
| | Powered HDMI splitter with EDID emulator | 1 | $35 | $35 |
| **Misc** | Enclosure, cable management, connectors | 1 | $150 | $150 |
| | Digital force gauge (P1 — essential tool) | 1 | $60 | $60 |
| | **Total** | | | **~$1,750–2,230** |

Add ~20 % for iteration, and one re-machined plate ($200) because the first one will have something wrong with it. Realistic all-in: **$2,300–2,900.**

---

## 14. Alternatives, honestly

Before committing 6 months and $2,500, confirm the mechanical requirement is real. In order of decreasing preference:

| Approach | Cost | Latency | Effort | When it's the right answer |
|---|---|---|---|---|
| **PiKVM / TinyPilot / NanoKVM** | $60–350 | ~1 ms | 1 day | Almost always. USB HID gadget + HDMI capture. Everything you asked for except the mechanics. |
| **Raspberry Pi Zero in USB gadget mode** | $20 | ~1 ms | 1 week | DIY version of the above; you write the firmware. |
| **BMC — iDRAC / iLO / IPMI** | $0 | ~1 ms | 0 | If the target is a server, it already has this. Check first. |
| **PS/2 injection** | $30 | ~2 ms | 1 week | Legacy/industrial targets with no usable USB stack. |
| **Hybrid: HID emulator + mechanical E-stop** | $200 | ~1 ms | 2 weeks | Middle ground: electrical injection, but physically interruptible and audited. |
| **This rig** | $2,500 | ~25 ms | 6 months | Only when policy forbids *any* electrical connection to the host, or when the target must be provably unable to distinguish the input from a human at the hardware level. |

If your requirement is genuinely the last row, everything above stands and the design is sound. If it is anything else, the top row is the honest recommendation and I'd rather say so now than at the end of a 900-line document.

---

## 15. First three things to do this week

1. Buy the digital force gauge, one keyboard, and five solenoids. Measure the actual actuation force of your specific keys and the actual force curve of your specific solenoid at three preload heights. This one afternoon determines direct-drive vs lever, which determines the plate design, which determines everything else.
2. Export the KLE JSON for your keyboard and write the script that turns it into a drill pattern. Ten minutes of work that eliminates the most expensive possible mistake.
3. Open the security conversation. It has the longest lead time in the project and it is the only blocker that no amount of engineering skill can unstick late.

---

## Sources

- [Adafruit Small Push-Pull Solenoid (JF-0530B, #412) — specifications](https://www.adafruit.com/product/412)
- [JF-0530B solenoid variants and force ratings — icstation](https://www.icstation.com/0530b-dc12v-300ma-5n10mm-pull-push-type-solenoid-electromagnet-p-7404.html)
- [TI TPIC6B595 Power Logic 8-Bit Shift Register datasheet](https://www.ti.com/lit/ds/symlink/tpic6b595.pdf)
- [Cherry MX switch specifications and actuation force ranges](https://computerstationnation.com/cherry-mx-switches-complete-specs-for-every-variant-2026/)
- [Mechanical switch spec tolerance ranges — Tom's Hardware](https://www.tomshardware.com/features/mechanical-switch-spec-ranges-and-those-pesky-plus-and-minus-signs)
- [Designing a power-saving (peak-and-hold) solenoid driver — Embedded.com](https://www.embedded.com/designing-a-power-saving-solenoid-driver-design-concepts/)
- [Mouse lift-off distance explained](https://akkogear.eu/blogs/news/mouse-lod-lift-off-distance-explained)
- [CoreXY kinematics overview](https://www.firgelliauto.com/blogs/mechanisms/corexy)
- [Adder — VNC mouse calibration and absolute-position homing](https://support.adder.com/tiki/tiki-index.php?page=VNC%3A+Mouse+Calibration)
- [TinyPilot — KVM over IP vs software remote control](https://tinypilotkvm.com/blogs/insights/kvm-over-ip-vs-software-remote-control)
- [Black Box — TEMPEST and secure KVM standards](https://www.blackbox.com/insights/blackbox-explains/inner/detail/kvm-switches-and-extenders/kvm-security/tempest-standard-and-common-criteria-(eal4-))
