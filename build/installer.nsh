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
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri ''https://swupdate.openvpn.org/community/releases/OpenVPN-2.6.14-I001-amd64.msi'' -OutFile ''$TEMP\nx3vpn-ovpn.msi'' -UseBasicParsing; Start-Process msiexec -Wait -ArgumentList ''/i'',''$TEMP\nx3vpn-ovpn.msi'',''/qn'',''/norestart''; Remove-Item ''$TEMP\nx3vpn-ovpn.msi'' -Force } catch { Write-Host $_.Exception.Message }"'

  nx3_done:
  DetailPrint "OpenVPN ready."
!macroend
