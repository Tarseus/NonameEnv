import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";
import "fake-indexeddb/auto";

const hasDevCondition = process.execArgv.some(a => a.startsWith("--conditions=") && a.includes("development"));
if (!hasDevCondition && !process.env.NONAME_DEV_CONDITION) {
	const scriptPath = fileURLToPath(import.meta.url);
	spawnSync(
		process.execPath,
		["--conditions=development", ...process.execArgv, scriptPath, ...process.argv.slice(2)],
		{ stdio: "inherit", env: { ...process.env, NONAME_DEV_CONDITION: "1" } }
	);
	process.exit(0);
}

import { rootURL, lib, game, get, ui, _status } from "../noname.js";
import { boot } from "../noname/init/index.js";

function setupDom(seed = 0) {
	const dom = new JSDOM("<!doctype html><html><body><div id=window></div></body></html>", {
		url: "http://localhost/",
		pretendToBeVisual: true,
	});
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.navigator = dom.window.navigator;
	globalThis.localStorage = dom.window.localStorage;
	globalThis.location = dom.window.location;
	globalThis.XMLHttpRequest = dom.window.XMLHttpRequest;
	globalThis.Blob = dom.window.Blob;
	globalThis.FileReader = dom.window.FileReader;
	globalThis.atob = dom.window.atob;
	globalThis.btoa = dom.window.btoa;

	globalThis.confirm = () => true;
	globalThis.alert = () => {};
	globalThis.prompt = () => null;

	localStorage.setItem("noname_inited", "nodejs");

	let x = (seed | 0) || 1;
	Math.random = () => {
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		return (x >>> 0) / 4294967296;
	};
}

function setModeConfig({ mode, single_mode }) {
	lib.config.mode = mode;
	lib.config.mode_config[mode] ??= {};
	for (const k in lib.config.mode_config.global) {
		lib.config.mode_config[mode][k] ??= lib.config.mode_config.global[k];
	}
	if (mode === "single") {
		lib.config.mode_config.single.single_mode = single_mode ?? "normal";
	}
}

function buildObsAndMask() {
	const evt = get.event();
	const me = game.me;
	const opp = game.players?.find(p => p !== me);

	const obs = [
		evt?.name ? evt.name.length : 0,
		me?.countCards?.("h") ?? 0,
		me?.hp ?? 0,
		opp?.hp ?? 0,
	];

	const HMAX = 20,
		PMAX = 2,
		A = HMAX + PMAX + 2;
	const mask = new Array(A).fill(0);

	const hand = (me?.getCards?.("h") ?? []).slice(0, HMAX);
	for (let i = 0; i < hand.length; i++) {
		if (hand[i]?.classList?.contains?.("selectable")) mask[i] = 1;
	}

	const ps = (game.players ?? []).slice(0, PMAX);
	for (let i = 0; i < ps.length; i++) {
		if (ps[i]?.classList?.contains?.("selectable")) mask[HMAX + i] = 1;
	}

	mask[HMAX + PMAX] = 1;
	mask[HMAX + PMAX + 1] = 1;

	return { obs, mask };
}

function applyAction(action) {
	const me = game.me;
	const HMAX = 20,
		PMAX = 2;
	const hand = (me?.getCards?.("h") ?? []).slice(0, HMAX);
	const ps = (game.players ?? []).slice(0, PMAX);

	const okIndex = HMAX + PMAX;
	const cancelIndex = okIndex + 1;

	if (action < HMAX) {
		const c = hand[action];
		if (c) ui.click.card.call(c);
		return;
	}
	if (action < HMAX + PMAX) {
		const p = ps[action - HMAX];
		if (p) ui.click.target.call(p);
		return;
	}
	if (action === okIndex) {
		ui.click.ok();
		return;
	}
	if (action === cancelIndex) {
		ui.click.cancel();
		return;
	}
}

async function main() {
	const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

	const helloLine = await new Promise(r => rl.once("line", r));
	const hello = JSON.parse(helloLine);

	setupDom(hello.seed ?? 0);

	lib.assetURL = rootURL.href;

	await boot();

	setModeConfig({ mode: hello.mode ?? "single", single_mode: hello.single_mode ?? "normal" });

	_status.auto = false;
	game.modeSwapPlayer = player => {
		game.me = player;
	};
	if (lib.element?.Player?.prototype) {
		lib.element.Player.prototype.isUnderControl = function () {
			return true;
		};
	}

	game.switchMode(lib.config.mode);

	while (!game.players || game.players.length === 0) {
		await new Promise(r => setTimeout(r, 0));
	}

	game.me = game.players[hello.seat ?? 0];
	for (const p of game.players) {
		p.isUnderControl = () => true;
	}

	const origPause = game.pause.bind(game);
	game.pause = function () {
		const evt = get.event();
		if (evt?.player && evt.player !== game.me) {
			game.resume();
			return;
		}
		return origPause();
	};

	let initialSent = false;
	const sendInitial = () => {
		if (initialSent) return;
		initialSent = true;
		try {
			const { obs, mask } = buildObsAndMask();
			const done = !!_status.over;
			process.stdout.write(JSON.stringify({ obs, mask, reward: 0, done }) + "\n");
			if (done) process.exit(0);
		} catch (e) {
			process.stderr.write(`[headless] initial emit error: ${e?.stack || e}\n`);
			process.stdout.write(JSON.stringify({ obs: [0, 0, 0, 0], mask: [0], reward: 0, done: false }) + "\n");
		}
	};

	setTimeout(() => {
		if (!initialSent) {
			sendInitial();
		}
	}, 3000);

	while (true) {
		while (!_status.paused && !_status.over) {
			await new Promise(r => setTimeout(r, 0));
		}

		sendInitial();
		if (_status.over) process.exit(0);

		const stepLine = await new Promise(r => rl.once("line", r));
		const msg = JSON.parse(stepLine);
		applyAction(msg.action);
	}
}

main().catch(e => {
	process.stderr.write(String(e?.stack || e) + "\n");
	process.exit(1);
});
