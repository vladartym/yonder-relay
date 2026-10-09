# Yonder relay

The relay connects the Yonder bridge on your computer to the Yonder app on
your phone. It forwards their frames. It is one file, `main.ts`, and it needs
only [Bun](https://bun.sh).

The phone and the bridge encrypt each frame end to end. The relay cannot read
or change the frames, and it writes nothing to disk.

Yonder uses our relay at `wss://relay.yonder.so`. Run this relay on your own
server, and the connections of your phone do not go through our server.

## What the relay sees, and why

- **The IP address of each connection.** The network needs it to send the
  frames back. The relay does not log it, store it or send it anywhere.
- **The time and the size of each frame.** The relay needs them only to
  forward the frame, and it does not keep them.
- **The secret token of your bridge.** The relay makes the room of your
  computer from a hash of it, so that only your computer can be the host of
  the room. A relay with the token can take the room, but it still cannot
  read the frames.
- **The app version and the model of each phone and computer, and a short ID
  of each phone.** The relay uses them only for the statistics (see below).

The relay keeps all of this in memory while the connection is open, and
forgets it when the connection closes.

## Run the relay

You need a server with Docker, and a DNS name that points to it. Open ports
80 and 443.

1. Clone this repository on the server.
2. Make a `.env` file next to `compose.yml`:

   ```sh
   DOMAIN=relay.example.com
   ```

3. Start the relay:

   ```sh
   docker compose up -d --build
   ```

4. Open `https://relay.example.com`. The page shows "Yonder relay".

Caddy gets the HTTPS certificate. To run the relay without Docker, run
`bun main.ts`. It listens on `PORT` (default `8080`), and you must put HTTPS
in front of it.

## Use the relay in Yonder

1. On your computer, open Yonder, then **Settings** > **Pair a phone**.
2. Open the **Relay** tab.
3. Type `wss://relay.example.com`, then click **Save**.
4. Pair your phone again. The QR code holds the relay address.

**Use default** goes back to `wss://relay.yonder.so`.

## Let only your computers connect

Without `ROOMS`, each Yonder bridge that knows the address can use your
relay. Each bridge still sees only its own encrypted frames.

1. Open **Settings** > **Pair a phone** in Yonder. The **Pair** tab shows
   the room of your computer, for example `room Xk2Fq9LmTz4WbN7pRd1VcA`.
2. Add the room to `.env`. Use a comma between two or more rooms:

   ```sh
   ROOMS=Xk2Fq9LmTz4WbN7pRd1VcA
   ```

3. Run `docker compose up -d` again.

## Statistics

`main.ts` can send the open and the close of each connection to a statistics
server, with the room, the app version, the model and the short ID of the
phone. It sends nothing if `STATS_URL` is not set. `compose.yml` does not
set it.

Our relay at `relay.yonder.so` sends these events to yonder.so, with the
country, the city and the map position of the city that Cloudflare finds from
the IP address. We use them to count usage and to find problems. They do not
contain the IP address. See the [privacy policy](https://yonder.so/privacy/).
The relay behind Caddy gets no country or city, because only Cloudflare adds
them.

## License

MIT. See `LICENSE`.
