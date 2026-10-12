// Firefox has no offscreen documents, so its (persistent) background page runs the model itself.
import { handle, setReporter } from "./engine.js";
import { setEngine } from "./background.js";

setReporter((status) => chrome.storage.session.set({ engine: status }));
setEngine(async (msg) => handle(msg));
