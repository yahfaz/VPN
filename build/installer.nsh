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
    DetailPrint "Installing OpenVPN components..."
    ExecWait 'msiexec /i "$INSTDIR\resources\win\openvpn-install.msi" /qn /norestart'
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
    FileWrite $0 "  Start-Process msiexec -Wait -ArgumentList '/i', $$msi, '/qn', '/norestart'$\r$\n"
    FileWrite $0 "  Remove-Item $$msi -Force -ErrorAction SilentlyContinue$\r$\n"
    FileWrite $0 "} catch { Write-Host $$_.Exception.Message }$\r$\n"
    FileClose $0
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\nx3vpn-install.ps1"'
    Delete "$TEMP\nx3vpn-install.ps1"

  nx3_done:
  DetailPrint "OpenVPN ready."
!macroend
