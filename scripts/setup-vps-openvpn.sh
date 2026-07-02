#!/usr/bin/env bash
#
# Nx3VPN — one-shot OpenVPN server setup for an Ubuntu AWS VPS (US region).
#
# Run this ON THE VPS as root:
#   sudo bash setup-vps-openvpn.sh [PUBLIC_IP]
#
# If PUBLIC_IP is omitted it's auto-detected. When it finishes you'll have a
# ready-to-use client config at ./nx3vpn-client.ovpn — copy that to the machine
# running Nx3VPN (see VPS-SETUP.md for where to put it).
#
# Afterwards, in the AWS console, make sure the instance's Security Group allows
# inbound UDP 1194 from 0.0.0.0/0 (and keep your SSH rule).
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Please run as root (sudo)." >&2; exit 1; fi

PUBLIC_IP="${1:-$(curl -fsS https://checkip.amazonaws.com || curl -fsS https://api.ipify.org)}"
PORT=1194
PROTO=udp
CADIR="/root/nx3vpn-ca"
OUT="$(pwd)/nx3vpn-client.ovpn"

echo "==> Public IP: ${PUBLIC_IP}"
echo "==> Installing packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y openvpn easy-rsa iptables-persistent curl iproute2

# Disable other OpenVPN installers' services that manage/flush iptables and can
# fight this setup (e.g. the angristan openvpn-install.sh). Leaving them enabled
# has caused the NAT rule to be flushed on stop, which breaks connectivity while
# the VPN still appears to connect. We keep ours (openvpn-server@server) only.
for svc in openvpn.service iptables-openvpn.service; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^${svc}"; then
    echo "==> Disabling conflicting service: ${svc}"
    systemctl disable --now "${svc}" 2>/dev/null || true
  fi
done

echo "==> Building PKI (CA, server + client certs, tls-crypt key)…"
rm -rf "$CADIR"
make-cadir "$CADIR"
cd "$CADIR"
export EASYRSA_BATCH=1
export EASYRSA_ALGO=ec          # ECDSA — fast, no slow Diffie-Hellman generation
export EASYRSA_CURVE=prime256v1
./easyrsa init-pki
./easyrsa build-ca nopass
./easyrsa build-server-full server nopass
./easyrsa build-client-full client nopass
openvpn --genkey secret pki/tc.key   # tls-crypt key (control-channel encryption)

echo "==> Writing server config…"
install -d /etc/openvpn/server
cp pki/ca.crt pki/issued/server.crt pki/private/server.key pki/tc.key /etc/openvpn/server/
cat > /etc/openvpn/server/server.conf <<EOF
port ${PORT}
proto ${PROTO}
dev tun
topology subnet
server 10.8.0.0 255.255.255.0
ca ca.crt
cert server.crt
key server.key
tls-crypt tc.key
dh none
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS 1.1.1.1"
push "dhcp-option DNS 8.8.8.8"
keepalive 10 120
cipher AES-256-GCM
data-ciphers AES-256-GCM:AES-128-GCM
auth SHA256
# MTU tuning — prevents VoIP / video-call fragmentation
# AES-256-GCM + tls-crypt adds ~120 B overhead per packet; without these
# settings 1500-byte UDP audio/video frames get fragmented at the IP layer,
# causing burst packet loss and choppy calls.
tun-mtu 1400
fragment 1300
mssfix 1300
push "mssfix 1300"
user nobody
group nogroup
persist-key
persist-tun
verb 3
EOF

echo "==> Enabling IP forwarding + NAT (self-healing)…"
sed -i 's/^#\?net.ipv4.ip_forward=.*/net.ipv4.ip_forward=1/' /etc/sysctl.conf
grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
sysctl -p >/dev/null

# Install a NAT helper that (re)applies forwarding + MASQUERADE + FORWARD-ACCEPT
# rules idempotently. It auto-detects the WAN interface each run, so it keeps
# working even if the NIC name changes after an instance resize.
cat > /usr/local/sbin/nx3vpn-nat.sh <<'NATEOF'
#!/usr/bin/env bash
set -e
WAN_IF="$(ip route | awk '/default/ {print $5; exit}')"
sysctl -w net.ipv4.ip_forward=1 >/dev/null
iptables -t nat -C POSTROUTING -s 10.8.0.0/24 -o "$WAN_IF" -j MASQUERADE 2>/dev/null \
  || iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o "$WAN_IF" -j MASQUERADE
iptables -C FORWARD -s 10.8.0.0/24 -j ACCEPT 2>/dev/null \
  || iptables -I FORWARD 1 -s 10.8.0.0/24 -j ACCEPT
iptables -C FORWARD -d 10.8.0.0/24 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
  || iptables -I FORWARD 1 -d 10.8.0.0/24 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
NATEOF
chmod +x /usr/local/sbin/nx3vpn-nat.sh

WAN_IF="$(ip route | awk '/default/ {print $5; exit}')"
/usr/local/sbin/nx3vpn-nat.sh
netfilter-persistent save || true

# Re-apply NAT on EVERY OpenVPN (re)start and on reboot. This is the key
# robustness fix: even if something flushes iptables (another tool, an AMI boot
# script, a manual mistake), the rules are restored the moment the VPN starts —
# so it can never again be "connected but no traffic flows".
install -d /etc/systemd/system/openvpn-server@server.service.d
cat > /etc/systemd/system/openvpn-server@server.service.d/nx3vpn-nat.conf <<'DROPEOF'
[Service]
ExecStartPre=/usr/local/sbin/nx3vpn-nat.sh
DROPEOF
systemctl daemon-reload

echo "==> Starting OpenVPN…"
# enable --now only *starts* a stopped service; if an old instance is already
# running it would keep the stale config + tls-crypt key in memory. Always
# restart so the freshly generated certs/keys actually take effect.
systemctl enable openvpn-server@server
systemctl restart openvpn-server@server
sleep 2
systemctl --no-pager --full status openvpn-server@server | head -n 5 || true

echo "==> Assembling client config → ${OUT}"
cat > "$OUT" <<EOF
client
dev tun
proto ${PROTO}
remote ${PUBLIC_IP} ${PORT}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
data-ciphers AES-256-GCM:AES-128-GCM
auth SHA256
verb 3
<ca>
$(cat pki/ca.crt)
</ca>
<cert>
$(openssl x509 -in pki/issued/client.crt)
</cert>
<key>
$(cat pki/private/client.key)
</key>
<tls-crypt>
$(cat pki/tc.key)
</tls-crypt>
EOF

chmod 600 "$OUT"

echo
echo "==> Self-test…"
FAIL=0
if ss -lun 2>/dev/null | grep -q ":${PORT} "; then echo "  [OK]  listening on UDP ${PORT}"; else echo "  [FAIL] not listening on UDP ${PORT}"; FAIL=1; fi
if [[ "$(cat /proc/sys/net/ipv4/ip_forward)" == "1" ]]; then echo "  [OK]  IP forwarding enabled"; else echo "  [FAIL] IP forwarding disabled"; FAIL=1; fi
if iptables -t nat -C POSTROUTING -s 10.8.0.0/24 -o "$WAN_IF" -j MASQUERADE 2>/dev/null; then echo "  [OK]  NAT MASQUERADE present on ${WAN_IF}"; else echo "  [FAIL] NAT MASQUERADE missing"; FAIL=1; fi
if systemctl is-active --quiet openvpn-server@server; then echo "  [OK]  openvpn-server@server is active"; else echo "  [FAIL] service not active"; FAIL=1; fi
if [[ -f /etc/systemd/system/openvpn-server@server.service.d/nx3vpn-nat.conf ]]; then echo "  [OK]  NAT self-heal drop-in installed"; else echo "  [FAIL] NAT self-heal drop-in missing"; FAIL=1; fi
if [[ $FAIL -eq 0 ]]; then echo "  ==> ALL CHECKS PASSED — server is production-ready."; else echo "  ==> SOME CHECKS FAILED — review the [FAIL] lines above before using."; fi

echo
echo "============================================================"
if [[ $FAIL -eq 0 ]]; then echo " Done ✅  Client config written to:"; else echo " Done (with warnings)  Client config written to:"; fi
echo "   ${OUT}"
echo
echo " Next steps:"
echo "  1. AWS Security Group (REQUIRED — the one thing this script can't do):"
echo "       allow inbound UDP ${PORT} from 0.0.0.0/0 on this instance."
echo "       This is the #1 reason a client gets stuck 'Connecting…'."
echo "  2. To bake this server into the app build, paste ${OUT} into"
echo "       server/vpn/defaultServerConfig.js (or secondServerConfig.js)."
echo "     To use it without rebuilding, copy ${OUT} to the client PC at:"
echo "       Windows:  %USERPROFILE%\\.nx3vpn\\custom-server.ovpn"
echo "       Linux/Mac: ~/.nx3vpn/custom-server.ovpn"
echo "  3. Anytime, verify this server's health (read-only, safe to re-run):"
echo "       sudo bash check-vps-openvpn.sh"
echo "============================================================"
