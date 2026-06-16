# Using your own AWS VPS as the primary VPN server

SurfVPN can connect to your own server as the **primary US endpoint**, with the
free VPNGate servers kept only as an automatic backup. This is the most reliable
setup: a guaranteed, always-on US IP with no dependency on VPNGate's flaky
volunteer pool or its occasionally-blocked (HTTP 403) server list.

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
`./surfvpn-client.ovpn`.

> If auto-detection picks the wrong address, pass the public IP explicitly:
> `sudo bash setup-vps-openvpn.sh 54.210.11.22`

Then, in the AWS console, open **UDP 1194** inbound on the instance's Security Group.

## 2. Install the client config (on the PC running SurfVPN)

Copy `surfvpn-client.ovpn` from the VPS to the SurfVPN machine and save it as
`custom-server.ovpn` here:

| OS         | Location                                          |
| ---------- | ------------------------------------------------- |
| Windows    | `%USERPROFILE%\.surfvpn\custom-server.ovpn`       |
| macOS/Linux| `~/.surfvpn/custom-server.ovpn`                   |

No rebuild needed — SurfVPN looks for this file on startup. (Alternatively set the
`CUSTOM_OVPN` environment variable to the file's full path, or bake it into the
installer by placing it next to the bundled resources.)

## 3. Restart SurfVPN

**My US Server** appears at the top of the server list and is selected by default.
Click Connect:

- The app connects to your VPS first.
- If the VPS is ever unreachable, it automatically falls back to VPNGate US servers
  (the 10-attempt auto-retry loop handles the failover).
- CleanWeb, Kill Switch, and Rotating IP all work the same as with VPNGate servers.

## Notes

- **Bandwidth cost:** all your traffic exits via the VPS. AWS includes **100 GB/month
  of free outbound data transfer** (account-wide, not just the 12-month trial), which
  comfortably covers normal browsing. Past 100 GB/month it's ~$0.09/GB, so only heavy
  streaming/downloads would incur a charge.
- **Rotating IP** with a single VPS just reconnects to the same server (same IP).
  For real IP rotation you'd need multiple servers or the VPNGate pool.
- To add more client devices, on the VPS run inside `/root/surfvpn-ca`:
  `EASYRSA_BATCH=1 ./easyrsa build-client-full client2 nopass` and assemble a new
  `.ovpn` the same way the script does.
