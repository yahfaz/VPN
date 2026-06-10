; Custom NSIS script — runs OpenVPN MSI silently to install tap-windows6
; adapter driver and the OpenVPN interactive service (runs as SYSTEM,
; required for network adapter creation without full SYSTEM privileges).
!macro customInstall
  DetailPrint "Installing OpenVPN drivers and service..."
  ExecWait '"$INSTDIR\resources\win\openvpn-install.msi" /qn /norestart'
  DetailPrint "OpenVPN setup complete."
!macroend
