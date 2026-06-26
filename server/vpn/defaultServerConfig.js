'use strict';

// ⚠️ SECURITY: this file embeds the client private key + tls-crypt key for the
// self-hosted AWS OpenVPN server. Anyone with this file can connect to that
// server. Keep this repository private. To rotate, run the openvpn-install
// script on the VPS, add a new client, and replace the cert/key blocks below
// (and the tls-crypt key from /etc/openvpn/server/tc.key).
//
// This is the baked-in DEFAULT primary US server (34.225.239.148), so the app
// connects to it immediately without fetching any public list. It can be
// overridden at runtime by CUSTOM_OVPN or ~/.nx3vpn/custom-server.ovpn
// (see customServer.js).
//
// Generated from `openvpn-install client add` on the VPS: matches the server's
// current PKI (CA cn_hOA28vy0BRdznxKJ, verify-x509-name server_Kn2tXtAzg4RZY3EZ,
// cipher AES-128-GCM). The remote IP is corrected to the Elastic IP and the
// <tls-crypt> block is filled in from /etc/openvpn/server/tc.key (the generator
// emits an empty block).

const DEFAULT_SERVER_OVPN = `client
dev tun
proto udp
remote 34.225.239.148 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
verify-x509-name server_Kn2tXtAzg4RZY3EZ name
auth SHA256
auth-nocache
cipher AES-128-GCM
data-ciphers AES-128-GCM
tls-version-min 1.2
tls-cipher TLS-ECDHE-ECDSA-WITH-AES-128-GCM-SHA256
tls-ciphersuites TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256
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
MIIB3DCCAYKgAwIBAgIQf1JSfJnQWqMbFS7J8lr+ezAKBggqhkjOPQQDAjAeMRww
GgYDVQQDDBNjbl9oT0EyOHZ5MEJSZHpueEtKMB4XDTI2MDYyNjE1MzcwN1oXDTM2
MDYyMzE1MzcwN1owFTETMBEGA1UEAwwKbngzY2xpZW50MjBZMBMGByqGSM49AgEG
CCqGSM49AwEHA0IABFoQwaWE8X4NDax4EzbJYQrIq0cDjo/hUo7RGRnbMQRoFtE1
4hI6BnEdm7qncP5jYx4I405GK+tUqB6wuFtvWlKjgaowgacwCQYDVR0TBAIwADAd
BgNVHQ4EFgQUXt1oj+z856RhDn0qnT55T3pnSLUwWQYDVR0jBFIwUIAUHYhSM7Tn
ZrC3yOLEPq6qhGz0MEahIqQgMB4xHDAaBgNVBAMME2NuX2hPQTI4dnkwQlJkem54
S0qCFC7TyuUXnid9FZT73OtZpK58jFTyMBMGA1UdJQQMMAoGCCsGAQUFBwMCMAsG
A1UdDwQEAwIHgDAKBggqhkjOPQQDAgNIADBFAiEAvqemi/GhfWIxbC3W+Dm7L5pS
pFnn6xEJcyNrzKrnfwECIG0nRs5acdxl6tO37/dDOBK1FK5j/08I+XZssQlXDwiS
-----END CERTIFICATE-----
</cert>
<key>
-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQghIN+xnlSholrOFOA
HAWxQeDj9vvnMoiOe+Q2wjvBtcKhRANCAARaEMGlhPF+DQ2seBM2yWEKyKtHA46P
4VKO0RkZ2zEEaBbRNeISOgZxHZu6p3D+Y2MeCONORivrVKgesLhbb1pS
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
