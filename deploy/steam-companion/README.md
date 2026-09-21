# Halcyon Steam Companion

Steam is optional and off by default. Browser, hosted and Docker deployments
need this small program on the computer where Steam games will run. The main
Halcyon container never receives Steam credentials or host process access.

## Install on Linux x86-64

1. Download and extract `halcyon-steam-companion-linux-x86_64.tar.gz` from the
   matching GitHub release.
2. Run `./install.sh` as the desktop user. Do not use sudo.
3. In Halcyon, open Store Settings, Video Games, and choose Connect Steam.
4. Approve the exact Halcyon address in the native pairing window, then sign
   into Steam in the separate Steam window.

The companion listens only on loopback. Every Halcyon origin receives a unique
random pairing token after explicit approval. Steam cookies and access tokens
never enter the browser, the Halcyon server, or a Docker container.

Browser deployments must be opened through HTTPS or as localhost on the
gaming computer. Browsers disable the required cryptography on plain HTTP LAN
pages, and Halcyon will refuse Steam rather than downgrade the pairing security.

Run `./uninstall.sh` from the extracted archive to remove the service and
binary. Disabling Steam inside Halcyon removes that store's pairing and stock
without uninstalling the companion, because another Halcyon deployment may
still use it.
