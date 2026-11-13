# Railway Digital Twin

A browser based, top down model railroad layout editor with simulated DCC and microcontroller connected devices. The browser adapter is an integration boundary for a future central server and hardware drivers; this MVP does not connect to real controllers or railway hardware.

## Run locally

Install Node.js 22.12 or newer, then run:

```powershell
npm install
npm run dev
```

Open the local address printed by Vite, usually `http://127.0.0.1:5173/`.

Create a production build with `npm run build`. Preview that build with `npm run preview`.

## Use the layout editor

- Choose straight track, curve, turnout, signal, DCC train, crosswalk lights or track sensor, then click the board to place it.
- Choose **Select & move** to drag pieces and devices. Select an item to inspect it, rotate it with the button or `R`, or remove it with `Delete`.
- Drag empty board space to pan and use the mouse wheel to zoom. **Fit view** restores the full board.
- Select a device to access its controls. Each simulated controller has an independent connection toggle. The DCC train runs around the included sample loop; signal aspect, crossing lights and sensor occupancy can be changed from their detail panel.
- The layout autosaves in this browser. Use **Export** and **Import** to transfer a JSON layout.

## Integration boundary and limits

The UI sends controller operations through a small simulated adapter. A future server transport can replace this adapter without changing the layout editor or device controls. Controller links, statuses and commands in this version are local simulations. DCC motion follows the supplied sample loop and does not derive a route from arbitrary track arrangements. Dimensions and signals are illustrative, not certified railway systems.

## Project files

- `index.html` — single page web app shell.
- `digital-twin.js` — interactive layout, device state, controller adapter and local persistence.
- `style.css` and `twin.css` — app styling.
- `vite.config.js` — local development server and production build settings.
