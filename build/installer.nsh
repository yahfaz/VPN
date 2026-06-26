; OpenVPN installation — runs silently so the user never needs to install it
; separately.  Strategy (in priority order):
;  1. Bundled MSI — present when the installer was built on Windows after
;     running "npm run prepare:win".  Fastest, works offline.
;  2. Skip — OpenVPN is already installed on the machine.
;  3. Download — fetch the MSI from the official mirror via PowerShell.
;     Requires an internet connection; takes ~30 s on a typical link.
!macro customInstall
  IfFileExists "$INSTDIR\resources\win\openvpn-install.msi" nx3_bundled nx3_chk1

  nx3_bundled:
    DetailPrint "Installing OpenVPN components (including TAP/Wintun driver)..."
    ; ADDLOCAL=ALL forces every MSI feature — most importantly the tap-windows6
    ; and Wintun kernel drivers — to install. A plain /qn install can skip the
    ; driver, leaving openvpn.exe with no network adapter ("ECONNREFUSED" / stuck
    ; connecting). The drivers are signed, so /qn installs them without a prompt.
    ExecWait 'msiexec /i "$INSTDIR\resources\win\openvpn-install.msi" /qn /norestart ADDLOCAL=ALL'
    Goto nx3_done

  nx3_chk1:
    IfFileExists "$PROGRAMFILES64\OpenVPN\bin\openvpn.exe" nx3_done nx3_chk2

  nx3_chk2:
    IfFileExists "$PROGRAMFILES\OpenVPN\bin\openvpn.exe" nx3_done nx3_download

  nx3_download:
    DetailPrint "Downloading OpenVPN (one-time, ~5 MB)..."
    FileOpen $0 "$TEMP\nx3vpn-install.ps1" w
    FileWrite $0 "$$url = 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.6.14-I001-amd64.msi'$\r$\n"
    FileWrite $0 "$$msi = Join-Path $$env:TEMP 'nx3vpn-ovpn.msi'$\r$\n"
    FileWrite $0 "try {$\r$\n"
    FileWrite $0 "  Invoke-WebRequest -Uri $$url -OutFile $$msi -UseBasicParsing$\r$\n"
    FileWrite $0 "  Start-Process msiexec -Wait -ArgumentList '/i', $$msi, '/qn', '/norestart', 'ADDLOCAL=ALL'$\r$\n"
    FileWrite $0 "  Remove-Item $$msi -Force -ErrorAction SilentlyContinue$\r$\n"
    FileWrite $0 "} catch { Write-Host $$_.Exception.Message }$\r$\n"
    FileClose $0
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\nx3vpn-install.ps1"'
    Delete "$TEMP\nx3vpn-install.ps1"

  nx3_done:
  DetailPrint "OpenVPN ready."

  ; ── Windows Firewall rules ─────────────────────────────────────────────────
  ; Pre-authorize the app and the bundled OpenVPN so the user never sees a
  ; "Windows Security Alert" prompt and never has to turn the firewall off.
  ; The installer runs as Administrator, so these rules are created silently.
  ; We allow both inbound and outbound for: the bundled openvpn.exe, the
  ; system-installed openvpn.exe (if the MSI placed one), and the app itself.
  DetailPrint "Configuring Windows Firewall rules..."

  ; Remove any stale rules from a previous install first (idempotent).
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nx3VPN"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nx3VPN OpenVPN"'

  ; Allow the bundled OpenVPN binary (runs from the app's resources folder).
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nx3VPN OpenVPN" dir=out action=allow program="$INSTDIR\resources\win\openvpn.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nx3VPN OpenVPN" dir=in  action=allow program="$INSTDIR\resources\win\openvpn.exe" enable=yes profile=any'

  ; Allow the system-installed OpenVPN binary (used as a fallback by the app).
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nx3VPN OpenVPN" dir=out action=allow program="$PROGRAMFILES64\OpenVPN\bin\openvpn.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nx3VPN OpenVPN" dir=in  action=allow program="$PROGRAMFILES64\OpenVPN\bin\openvpn.exe" enable=yes profile=any'

  ; Allow the main application executable.
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nx3VPN" dir=out action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nx3VPN" dir=in  action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any'

  ; Allow OpenVPN's UDP port directly as a belt-and-suspenders measure.
  nsExec::Exec 'netsh advfirewall firewall add rule name="Nx3VPN UDP 1194" dir=out action=allow protocol=UDP remoteport=1194 enable=yes profile=any'
!macroend

; Clean up firewall rules on uninstall so we don't leave orphaned entries.
!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nx3VPN"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nx3VPN OpenVPN"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Nx3VPN UDP 1194"'
!macroend
