# Using your own AWS VPS as the primary VPN server

Nx3VPN connects **only** to your own server — a guaranteed, always-on US IP with
no dependency on any public server list. The free VPNGate pool is **off by
default**; set `ENABLE_VPNGATE_FALLBACK=true` if you ever want it as a backup.

## Requirements

- An Ubuntu VPS (20.04/22.04) **in a US region** (e.g. `us-east-1`, `us-west-2`).
  The app verifies the tunnel's public IP is US and will refuse to stay connected
  otherwise.
- Root/sudo access to the VPS.
- The instance's **Security Group must allow inbound UDP 1194** (plus your SSH rule).

## 1. Set up the server (run once, on the VPS)

Copy `scripts/setup-vps-openvpn.sh` to the VPS and run:

```bash
sudo bash setup-vps-openvpn.sh
```

It installs OpenVPN, builds the certificates (ECDSA — no slow Diffie-Hellman
wait), enables NAT, starts the service, and writes a ready client config to
`./nx3vpn-client.ovpn`.

> If auto-detection picks the wrong address, pass the public IP explicitly:
> `sudo bash setup-vps-openvpn.sh 54.210.11.22`

Then, in the AWS console, open **UDP 1194** inbound on the instance's Security Group.

## 2. Install the client config (on the PC running Nx3VPN)

Copy `nx3vpn-client.ovpn` from the VPS to the Nx3VPN machine and save it as
`custom-server.ovpn` here:

| OS         | Location                                          |
| ---------- | ------------------------------------------------- |
| Windows    | `%USERPROFILE%\.nx3vpn\custom-server.ovpn`       |
| macOS/Linux| `~/.nx3vpn/custom-server.ovpn`                   |

No rebuild needed — Nx3VPN looks for this file on startup. (Alternatively set the
`CUSTOM_OVPN` environment variable to the file's full path, or bake it into the
installer by placing it next to the bundled resources.)

## 3. Restart Nx3VPN

**My US Server** appears at the top of the server list and is selected by default.
Click Connect:

- The app connects to your VPS, and only your VPS.
- If a connection attempt fails, it retries the same server (up to 10 attempts)
  rather than falling back to any free server.
- CleanWeb, Kill Switch, and Rotating IP all work as normal.

## Updating an existing server (MTU fix for calls)

If you set up the server before v1.0.5 and users report choppy or dropped calls
(Zoom, WhatsApp, Teams, Google Meet), SSH into the VPS and patch the server config:

```bash
sudo tee -a /etc/openvpn/server/server.conf <<'EOF'
tun-mtu 1400
fragment 1300
mssfix 1300
push "mssfix 1300"
EOF
sudo systemctl restart openvpn-server@server
```

No client reinstall needed — `mssfix` is applied automatically by the Nx3VPN app
on every connection.

## Notes

- **Bandwidth cost:** all your traffic exits via the VPS. AWS includes **100 GB/month
  of free outbound data transfer** (account-wide, not just the 12-month trial), which
  comfortably covers normal browsing. Past 100 GB/month it's ~$0.09/GB, so only heavy
  streaming/downloads would incur a charge.
- **Rotating IP** with a single VPS just reconnects to the same server (same IP).
  For real IP rotation you'd need multiple servers or the VPNGate pool.
- To add more client devices, on the VPS run inside `/root/nx3vpn-ca`:
  `EASYRSA_BATCH=1 ./easyrsa build-client-full client2 nopass` and assemble a new
  `.ovpn` the same way the script does.
