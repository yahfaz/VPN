'use strict';

// ⚠️ SECURITY: this file embeds the client private key + tls-crypt-v2 key for the
// self-hosted AWS OpenVPN server. Anyone with this file can connect to that
// server. Keep this repository private. To rotate, revoke "newclient" on the
// server (e.g. ./openvpn-install.sh → Revoke), issue a new client, and replace
// the config below.
//
// This is the baked-in DEFAULT primary US server, so the app connects to it
// immediately without fetching any public list. It can be overridden at runtime
// by CUSTOM_OVPN or ~/.nx3vpn/custom-server.ovpn (see customServer.js).

const DEFAULT_SERVER_OVPN = `client
proto udp
explicit-exit-notify
remote 100.49.193.223 1194
dev tun
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
verify-x509-name server_Kn2tXtAzg4RZY3EZ name
auth SHA256
auth-nocache
cipher AES-128-GCM
ignore-unknown-option data-ciphers
data-ciphers AES-128-GCM
ncp-ciphers AES-128-GCM
tls-client
tls-version-min 1.2
tls-cipher TLS-ECDHE-ECDSA-WITH-AES-128-GCM-SHA256
tls-ciphersuites TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256
ignore-unknown-option block-outside-dns
setenv opt block-outside-dns # Prevent Windows 10 DNS leak
verb 3
<ca>
-----BEGIN CERTIFICATE-----
MIIB2jCCAYCgAwIBAgIULtPK5ReeJ30VlPvc61mkrnyMVPIwCgYIKoZIzj0EAwIw
HjEcMBoGA1UEAwwTY25faE9BMjh2eTBCUmR6bnhLSjAeFw0yNjA2MTYxNDM4MTFa
Fw0zNjA2MTMxNDM4MTFaMB4xHDAaBgNVBAMME2NuX2hPQTI4dnkwQlJkem54S0ow
WTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQEGJfsbpE+p9XbQ2XGPuPBYjv0hjH1
6eRrdBfYNMuiuGpHDTdtJRJaUKUlfpo73DTzUi4XYZQTaUin3rzrApKdo4GbMIGY
MA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0OBBYEFB2IUjO052awt8jixD6uqoRs9DBG
MFkGA1UdIwRSMFCAFB2IUjO052awt8jixD6uqoRs9DBGoSKkIDAeMRwwGgYDVQQD
DBNjbl9oT0EyOHZ5MEJSZHpueEtKghQu08rlF54nfRWU+9zrWaSufIxU8jALBgNV
HQ8EBAMCAQYwCgYIKoZIzj0EAwIDSAAwRQIgcTO7TjLF1Qnoo2rRdieQgqZtTv6E
63jdOCNVDi+K6yMCIQDCnEfiuF/B6Oeme9IEu3/o9QjEaXdvAgcS6/LYk3afwA==
-----END CERTIFICATE-----
</ca>
<cert>
-----BEGIN CERTIFICATE-----
MIIB3TCCAYKgAwIBAgIRAJS63ihE6wULoNurWw8CyJ8wCgYIKoZIzj0EAwIwHjEc
MBoGA1UEAwwTY25faE9BMjh2eTBCUmR6bnhLSjAeFw0yNjA2MTYxNDQzNDVaFw0z
NjA2MTMxNDQzNDVaMBQxEjAQBgNVBAMMCW5ld2NsaWVudDBZMBMGByqGSM49AgEG
CCqGSM49AwEHA0IABISROhYv8q5q41yxbvAv+ItDl30381BzJI+JgM745dI/rXC1
1LLj/eX3ZaYBXT1d8a+t4elNUAFLPnApq9vAtTmjgaowgacwCQYDVR0TBAIwADAd
BgNVHQ4EFgQUhZ90I4zmPJ8jGXSyYDyx2xiYsKswWQYDVR0jBFIwUIAUHYhSM7Tn
ZrC3yOLEPq6qhGz0MEahIqQgMB4xHDAaBgNVBAMME2NuX2hPQTI4dnkwQlJkem54
S0qCFC7TyuUXnid9FZT73OtZpK58jFTyMBMGA1UdJQQMMAoGCCsGAQUFBwMCMAsG
A1UdDwQEAwIHgDAKBggqhkjOPQQDAgNJADBGAiEAojDNly3DKcnIuhQVRWDw797O
M5gNvpkco9uNnMozwiwCIQDbqt3gYC3eMWLWHXz9U51QFm2/rfu4C3hkalZD+TOs
Ew==
-----END CERTIFICATE-----
</cert>
<key>
-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgQon+9pbFJ4v79jM3
+hUKVvbxFU/TWz8VLnyfed15B1WhRANCAASEkToWL/KuauNcsW7wL/iLQ5d9N/NQ
cySPiYDO+OXSP61wtdSy4/3l92WmAV09XfGvreHpTVABSz5wKavbwLU5
-----END PRIVATE KEY-----
</key>
<tls-crypt-v2>
-----BEGIN OpenVPN tls-crypt-v2 client key-----
gTvUuP+m7wULPqcLKnh+zAk12ItABHX7zzYgi8hzrqbB/tShaoyiwBEP8aVrjrC/
AdOAaETd6TWv41UcEmg9iLEU6ffdPtoQGLWXE6rSSvj/XIg/I2D/I+/vJ17GvTa4
YFw4BOmvwGuQm4x6b+gFXYIXLphzYH/828p0Xzu+tP0uekkH/5P8haZcdPR9jidx
pFcR5d9SMR4uxs5cfAbPKEG5TXXotOksHFMTvpcbwwEh1uMTYcEJ1R39JE8gpy2z
8CxIHwrbZcxLKY7I4XJeIBxw/6oPy4+jDPd72uDf9FXqFK9lX3Cr7F3qSbhMA5zV
BNijFcbGnhM8qv2RHEpgQnlLoY9iRuN2tWO6i5ggxyvpfBLUi0rpUQZ/v9GKf8ny
tPGjuNSWRRfiDldO2QUTIugMGRz5ovPTwMPBSc0/uaYTIX0reOOqUsxTOnNEASth
LBOdBQLONecFbyYpUyX0yYkuszLEVyrI19fwHbXcwQ07s0BA011Kw4t+t5l5dXGS
jy8c3YIBrr43zgemr3/AZ3Mq1GSFwYCP83cemOIn5MjjT0gNxUWbZc0Beq2hDtya
3two9GyO7u7bvHyfNfnjsD6BgdvAfgXXDGzNvoUYMP9ERvtSnftFnp0SJRgQASZ7
JBC+da6EhR2KN6M3wA2aZZtsvS4ySfj8U+Y0Yyxjtr5KRXOaKxO6MoAA4UgtiZfh
MB31F1wCT/rBBSApKD7JWanUlNQodABHsQEr
-----END OpenVPN tls-crypt-v2 client key-----
</tls-crypt-v2>
`;

module.exports = { DEFAULT_SERVER_OVPN };
