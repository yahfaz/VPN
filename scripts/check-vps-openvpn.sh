#!/usr/bin/env bash
#
# Nx3VPN — health check for a configured OpenVPN VPS. Read-only: it does NOT
# regenerate keys or change config, so it's safe to run anytime.
#
#   sudo bash check-vps-openvpn.sh
#
# Verifies the server is in a state where the Nx3VPN app can connect and route
# traffic. Anything marked [FAIL] is a reason the app would get stuck.
set -uo pipefail

PORT=1194
SUBNET=10.8.0.0/24
FAIL=0
ok()   { echo "  [OK]   $1"; }
bad()  { echo "  [FAIL] $1"; FAIL=1; }
warn() { echo "  [WARN] $1"; }

echo "==> Nx3VPN VPS health check"

# 1. Service running
if systemctl is-active --quiet openvpn-server@server; then
  ok "openvpn-server@server is active"
else
  bad "openvpn-server@server is NOT active  (fix: sudo systemctl restart openvpn-server@server)"
fi

# 2. Listening on UDP 1194
if ss -lun 2>/dev/null | grep -q ":${PORT} "; then
  ok "listening on UDP ${PORT}"
else
  bad "not listening on UDP ${PORT}"
fi

# 3. IP forwarding
if [[ "$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)" == "1" ]]; then
  ok "IP forwarding enabled"
else
  bad "IP forwarding disabled  (fix: sudo sysctl -w net.ipv4.ip_forward=1)"
fi

# 4. NAT MASQUERADE for the tunnel subnet
WAN_IF="$(ip route | awk '/default/ {print $5; exit}')"
if iptables -t nat -C POSTROUTING -s "${SUBNET}" -o "${WAN_IF}" -j MASQUERADE 2>/dev/null; then
  ok "NAT MASQUERADE present for ${SUBNET} on ${WAN_IF}"
elif iptables -t nat -L POSTROUTING -n 2>/dev/null | grep -q "MASQUERADE.*10.8.0.0/24"; then
  warn "MASQUERADE exists but not on detected WAN iface ${WAN_IF} — verify the outbound NIC"
else
  bad "NAT MASQUERADE missing  (this makes the VPN connect but pass no traffic)"
fi

# 5. FORWARD not blocking the tunnel subnet
POLICY="$(iptables -L FORWARD -n 2>/dev/null | head -1)"
if echo "$POLICY" | grep -q "policy ACCEPT"; then
  ok "FORWARD chain default policy is ACCEPT"
elif iptables -C FORWARD -s "${SUBNET}" -j ACCEPT 2>/dev/null; then
  ok "FORWARD has explicit ACCEPT for ${SUBNET}"
else
  bad "FORWARD policy is DROP and no ACCEPT rule for ${SUBNET}  (traffic will be dropped)"
fi

# 6. Self-heal drop-in
if [[ -f /etc/systemd/system/openvpn-server@server.service.d/nx3vpn-nat.conf ]]; then
  ok "NAT self-heal drop-in installed (survives reboots)"
else
  warn "NAT self-heal drop-in missing — re-run setup-vps-openvpn.sh to install it"
fi

# 7. No conflicting installers left enabled
for svc in openvpn.service iptables-openvpn.service; do
  if systemctl is-enabled --quiet "$svc" 2>/dev/null; then
    warn "conflicting service still enabled: ${svc}  (fix: sudo systemctl disable --now ${svc})"
  fi
done

echo
if [[ $FAIL -eq 0 ]]; then
  echo "==> HEALTHY ✅  The app should connect and route traffic."
  echo "    (If a client still can't connect, check the AWS Security Group allows"
  echo "     inbound UDP ${PORT} from 0.0.0.0/0 — that's the one thing not visible here.)"
else
  echo "==> UNHEALTHY ❌  Fix the [FAIL] lines above, then re-run this check."
fi
exit $FAIL
