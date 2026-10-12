#!/bin/sh
# Test browser: Chrome for Testing (honours --load-extension), on the NVIDIA GPU via PRIME offload, CDP on :9555.
# Uses the copy of the radar-only X profile, never the owner's main account.
exec env __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia __VK_LAYER_NV_optimus=NVIDIA_only \
  /run/media/neo/miki/feedfilter/cft/chrome-linux64/chrome --user-data-dir=/run/media/neo/miki/feedfilter/radar-x-copy \
  --remote-debugging-port=9555 --remote-debugging-address=127.0.0.1 --load-extension="$(dirname "$0")/../extension" \
  --enable-unsafe-webgpu --enable-features=Vulkan --ozone-platform=x11 --no-first-run --no-default-browser-check \
  --window-size=1300,950 "${1:-about:blank}"
