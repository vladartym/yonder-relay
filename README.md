# Yonder relay

The relay passes the messages between your phone and your computer. It
cannot read or change them.

Your phone and your computer encrypt each message end to end. The relay
writes nothing to disk. It is one file, `main.ts`, and it needs only
[Bun](https://bun.sh).

Yonder uses our relay at `wss://relay.yonder.so`. Run your own, and your
messages do not go through our server.

## What the relay sees

- **The IP address of each connection.** It does not log, keep or send it.
- **The time and the size of each message.** It needs them only to forward
  the message.
- **The token of your computer.** The room of your computer is a hash of it.
  A relay with the token can take the room, but it cannot read the messages.
- **The app version and the model of each device, and a short ID of each
  phone.** It uses them only for the statistics.

The relay keeps all of this in memory, and forgets it when the connection
closes.

## Run your own

You need a server with Docker, a domain name that points to it, and the ports
80 and 443 open.

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

Caddy gets the HTTPS certificate. Without Docker, run `bun main.ts`. It
listens on `PORT` (default `8080`). Put HTTPS in front of it.

## Use it in Yonder

1. In Yonder on your computer, open **Settings** > **Pair a phone** >
   **Relay**.
2. Type `wss://relay.example.com`, then click **Save**.
3. Pair your phone again. The QR code holds the address of the relay.

**Use default** goes back to `wss://relay.yonder.so`.

## Allow only your computers

By default, any Yonder computer that knows the address can use your relay.
Each one sees only its own messages.

1. In **Settings** > **Pair a phone**, the **Pair** tab shows the room of
   your computer, such as `room Xk2Fq9LmTz4WbN7pRd1VcA`.
2. Add the room to `.env`. Put a comma between the rooms:

   ```sh
   ROOMS=Xk2Fq9LmTz4WbN7pRd1VcA
   ```

3. Run `docker compose up -d` again.

## Statistics

With `STATS_URL` set, the relay sends the open and the close of each
connection to that server: the room, the app version, the model and the short
ID of the phone. `compose.yml` does not set it, so your relay sends nothing.

Our relay sends these events to yonder.so, with the country, the city and its
map position that Cloudflare finds from the IP address. The events never hold
the IP address. We use them to count the usage and to find problems. See the
[privacy policy](https://yonder.so/privacy/).

Behind Caddy, the relay gets no country or city. Only Cloudflare adds them.

## License

MIT. See `LICENSE`.
