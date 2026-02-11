import { setupHeadlessGlobals, patchHeadlessUI } from "./bootstrap.mjs";

await setupHeadlessGlobals();

const { boot } = await import("../noname/init/index.js");
const { lib, game, _status, ui } = await import("../noname.js");

patchHeadlessUI({ ui, game });

localStorage.setItem(`${lib.configprefix}directstart`, "1");
localStorage.setItem(`${lib.configprefix}show_splash_off`, "1");

await boot();

_status.auto = true;

const waitForOver = () =>
	new Promise(resolve => {
		const interval = setInterval(() => {
			if (_status.over) {
				clearInterval(interval);
				resolve();
			}
		}, 100);
	});

await waitForOver();
console.log("[headless] game over.");
