'use strict';

// ⚠️ SECURITY: this file embeds the client private key + tls-crypt key for the
// self-hosted AWS OpenVPN server. Anyone with this file can connect to that
// server. Keep this repository private. To rotate, run setup-vps-openvpn.sh
// again on the VPS, issue a new client cert, and replace the config below.
//
// This is the baked-in DEFAULT primary US server, so the app connects to it
// immediately without fetching any public list. It can be overridden at runtime
// by CUSTOM_OVPN or ~/.nx3vpn/custom-server.ovpn (see customServer.js).

const DEFAULT_SERVER_OVPN = `client
dev tun
proto udp
remote 34.225.239.148 1194
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
-----BEGIN CERTIFICATE-----
MIIBwDCCAWWgAwIBAgIUCNIYoMsu2sQULdNpgKmsZDImY9YwCgYIKoZIzj0EAwIw
FjEUMBIGA1UEAwwLRWFzeS1SU0EgQ0EwHhcNMjYwNjI0MTgwMDA0WhcNMzYwNjIx
MTgwMDA0WjAWMRQwEgYDVQQDDAtFYXN5LVJTQSBDQTBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABGizgwIIBS+onMi2kcQYhtc1/FnYAopSkXMeXh0zTuPgnIYOypho
eUp8IeuuP3AgY5sgITU6LRttCqbf4pdnTE2jgZAwgY0wDAYDVR0TBAUwAwEB/zAd
BgNVHQ4EFgQUlDI/OEyamW1OghYo/Z5O2XWgQggwUQYDVR0jBEowSIAUlDI/OEya
mW1OghYo/Z5O2XWgQgihGqQYMBYxFDASBgNVBAMMC0Vhc3ktUlNBIENBghQI0hig
yy7axBQt02mAqaxkMiZj1jALBgNVHQ8EBAMCAQYwCgYIKoZIzj0EAwIDSQAwRgIh
ANrjgUZnerBfHvMs1mL5QfBxJxcL/PDBvLwGD4h451/zAiEAkozepQOaNfixSoQ9
IscG319Nc/NweQAnHTcsJ+RHYOM=
-----END CERTIFICATE-----
</ca>
<cert>
-----BEGIN CERTIFICATE-----
MIIByjCCAW+gAwIBAgIRAJ6I+Vzvlq1Kv3pEJ+1jw4kwCgYIKoZIzj0EAwIwFjEU
MBIGA1UEAwwLRWFzeS1SU0EgQ0EwHhcNMjYwNjI0MTgwMDA0WhcNMjgwOTI2MTgw
MDA0WjARMQ8wDQYDVQQDDAZjbGllbnQwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC
AATDh/DbveX8BMOSUB/Q/Zg6Gv3q2HSDFpkRU71+v8KONaj+nvAsfShMpg+srSnU
KXrkcODGZXOyFRWAxHtZgr0jo4GiMIGfMAkGA1UdEwQCMAAwHQYDVR0OBBYEFCL9
KHF0YLNNuqMIUQBSB1leeF0YMFEGA1UdIwRKMEiAFJQyPzhMmpltToIWKP2eTtl1
oEIIoRqkGDAWMRQwEgYDVQQDDAtFYXN5LVJTQSBDQYIUCNIYoMsu2sQULdNpgKms
ZDImY9YwEwYDVR0lBAwwCgYIKwYBBQUHAwIwCwYDVR0PBAQDAgeAMAoGCCqGSM49
BAMCA0kAMEYCIQCO3y16C7c+zjx17MqLMa/RisS5sR77XlnARC1rrlRZ0gIhAPyV
cZAUfNJuLlCyL/BF/rTL8dP3aTMicOOfdiZN4I+k
-----END CERTIFICATE-----
</cert>
<key>
-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQggaIciSOcQEyvc+g2
SxWqNaeIJ7xGWZWE50Yte1tfSo2hRANCAATDh/DbveX8BMOSUB/Q/Zg6Gv3q2HSD
FpkRU71+v8KONaj+nvAsfShMpg+srSnUKXrkcODGZXOyFRWAxHtZgr0j
-----END PRIVATE KEY-----
</key>
<tls-crypt>
#
# 2048 bit OpenVPN static key
#
-----BEGIN OpenVPN Static key V1-----
029461fba1c111a262f1158abf2001f1
3ff8af0598c75f619cc2812a32b192c9
fc6dc354dec418a436d7d2bbf41ca27c
ff3fdf16b52376c672ff2125cff7010e
73c77d1ba3bb07dd8d1840ee2a0577e6
22e9d6ba4e3eaf2c0b1f710c2bb113e1
2e9f7028eee8aa318e9ebc00c8e4164b
644d101a5cd58cfa6097b4ed14e20500
a005fa497d94159a4565a75847f51dab
cb073b02ec8e0b77ef17678af60d4e0d
70f6cd8a2c138a80dc9348c090729bc6
56bf3afba585adef60ddc7de9a795629
a72bd005391ae546dca865a9c1fb1a09
a3bb008f8f1621456071c051d9ede634
b200a79308a43768965a3d10044bc0bf
d0a5f23e2f436653fb05c11ae96faa3b
-----END OpenVPN Static key V1-----
</tls-crypt>
`;

module.exports = { DEFAULT_SERVER_OVPN };
