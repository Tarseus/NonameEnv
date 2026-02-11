import { setupHeadlessGlobals, patchHeadlessUI, installPauseBridge } from "./bootstrap.mjs";

export async function createHeadlessEnv() {
	await setupHeadlessGlobals();
	const { boot } = await import("../noname/init/index.js");
	const { game, get, _status, ui, lib } = await import("../noname.js");

	patchHeadlessUI({ ui, game });

	localStorage.setItem(`${lib.configprefix}directstart`, "1");
	localStorage.setItem(`${lib.configprefix}show_splash_off`, "1");

	await boot();

	_status.auto = false;
	game.modeSwapPlayer = player => {
		game.me = player;
	};
	for (const player of game.players) {
		player.isUnderControl = () => true;
	}

	const bridge = installPauseBridge({ game, get, _status });

	return { game, get, _status, ui, bridge };
}
