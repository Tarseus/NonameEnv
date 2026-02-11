import readline from "node:readline";
import { appendFileSync } from "node:fs";
import { setupHeadless } from "./bootstrap";

type StepMsg = { cmd: "step"; action: number } | { cmd: "snapshot" };
type HelloMsg = { cmd: "hello"; seed: number; mode: string; seat: number };

const Pmax = 8;
const Hmax = 20;
const Bmax = 30;
const A = Hmax + Pmax + Bmax + 2;

function hash32(s: string) {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function suitId(suit: any) {
	if (suit === "spade") return 1;
	if (suit === "heart") return 2;
	if (suit === "club") return 3;
	if (suit === "diamond") return 4;
	return 0;
}

function makeLatch<T>() {
	let resolve!: (v: T) => void;
	let p = new Promise<T>(r => (resolve = r));
	return {
		wait: () => p,
		fire: (v: T) => {
			resolve(v);
			p = new Promise<T>(r => (resolve = r));
		},
	};
}

async function main() {
	const debug = process.env.NONAME_HEADLESS_DEBUG === "1";
	const log = (msg: string) => {
		if (debug) process.stderr.write(`[headless] ${msg}\n`);
	};
	const flog = (msg: string) => {
		if (debug) appendFileSync("headless/debug.log", `[headless] ${msg}\n`);
	};
	process.stderr.write("[headless] main start\n");
	flog("main start");
	console.log = (...args: any[]) => process.stderr.write(args.join(" ") + "\n");
	console.error = (...args: any[]) => process.stderr.write(args.join(" ") + "\n");

	const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
	const lineQueue: string[] = [];
	const lineWaiters: Array<(line: string | null) => void> = [];
	let lineClosed = false;
	rl.on("line", line => {
		if (lineWaiters.length) {
			lineWaiters.shift()!(line);
		} else {
			lineQueue.push(line);
		}
	});
	rl.on("close", () => {
		lineClosed = true;
		while (lineWaiters.length) {
			lineWaiters.shift()!(null);
		}
	});
	const readLine = () =>
		new Promise<string | null>(resolve => {
			if (lineQueue.length) {
				resolve(lineQueue.shift()!);
				return;
			}
			if (lineClosed) {
				resolve(null);
				return;
			}
			lineWaiters.push(resolve);
		});

	let hello: HelloMsg | null = null;
	const helloTimeoutMs = Number(process.env.NONAME_HELLO_TIMEOUT_MS || "0");
	const helloPromise = (async () => {
		while (true) {
			const line = await readLine();
			if (line == null) return;
			if (!line.trim()) continue;
			hello = JSON.parse(line);
			return;
		}
	})();
	if (helloTimeoutMs > 0) {
		await Promise.race([helloPromise, new Promise(r => setTimeout(r, helloTimeoutMs))]);
	} else {
		await helloPromise;
	}
	if (!hello) {
		if (process.env.NONAME_DEFAULT_HELLO === "1") {
			hello = { cmd: "hello", seed: 0, mode: "single", seat: 0 };
		} else {
			process.stderr.write("missing hello\n");
			process.exit(2);
		}
	}

	await setupHeadless({ seed: hello.seed });
	log("setupHeadless done");
	flog("setupHeadless done");
	// pass desired mode into headless boot
	// @ts-expect-error ignore
	globalThis.NONAME_HEADLESS_MODE = hello.mode;

	let rootURL: any, lib: any, game: any, get: any, ui: any, _status: any;
	try {
		({ rootURL, lib, game, get, ui, _status } = await import("../noname.js"));
	} catch (e: any) {
		process.stderr.write(String(e?.stack || e) + "\n");
		throw e;
	}
	const { boot } = await import("@/init/index.js");
	log("imports done");
	flog("imports done");
	const { readFile } = await import("node:fs/promises");
	const { fileURLToPath } = await import("node:url");
	const vm = await import("node:vm");

	lib.assetURL = rootURL.href;
	log(`assetURL=${lib.assetURL}`);
	flog(`assetURL=${lib.assetURL}`);
	if (lib.init) {
		lib.init.reset = () => {};
	}

	// headless UI patches
	const makeDiv = (id?: string) => {
		const node = document.createElement("div");
		if (id) node.id = id;
		// @ts-expect-error ignore
		node.show = () => {
			node.style.display = "";
		};
		// @ts-expect-error ignore
		node.hide = () => {
			node.style.display = "none";
		};
		return node as any;
	};
	ui.update = () => {};
	ui.refresh = () => {};
	ui.updatec = () => {};
	ui.updatex = () => {};
	ui.updatez = () => {};
	ui.updated = () => {};
	ui.updatehl = () => {};
	ui.updateh = () => {};
	ui.updatej = () => {};
	ui.updatem = () => {};
	ui.updatePlayerPositions = () => {};
	ui.updateConnectPlayerPositions = () => {};
	ui.css ??= {};
	// ensure layout placeholders exist
	// @ts-expect-error headless stub
	ui.css.layout ??= { href: "" };
	// @ts-expect-error headless stub
	ui.css.menu ??= { href: "" };
	// @ts-expect-error headless stub
	ui.css.phone ??= { href: "" };
	// @ts-expect-error headless stub
	ui.css._others ??= { href: "" };
	// @ts-expect-error headless stub
	ui.css._skill ??= { href: "" };
	ui.create.dialog = (...args: any[]) => {
		const node = makeDiv();
		const contentContainer = makeDiv();
		const content = makeDiv();
		const contentInner = makeDiv();
		content.appendChild(contentInner);
		contentContainer.appendChild(content);
		node.appendChild(contentContainer);
		// @ts-expect-error ignore
		node.content = content;
		// @ts-expect-error ignore
		node.contentContainer = contentContainer;
		// @ts-expect-error ignore
		node.buttons = [];
		// @ts-expect-error ignore
		node.open = () => {};
		// @ts-expect-error ignore
		node.close = () => {};
		// @ts-expect-error ignore
		node.add = (html: string) => {
			const child = document.createElement("div");
			if (typeof html === "string") child.innerHTML = html;
			content.appendChild(child);
			return child as any;
		};
		// @ts-expect-error ignore
		node.delete = () => node.remove();
		const pairs: Array<[any[], string]> = [];
		const scan = (val: any) => {
			if (!Array.isArray(val)) return;
			if (Array.isArray(val[0]) && typeof val[1] === "string") {
				pairs.push([val[0], val[1]]);
				return;
			}
			if (Array.isArray(val[1]) && typeof val[1][1] === "string" && Array.isArray(val[1][0])) {
				pairs.push([val[1][0], val[1][1]]);
				return;
			}
			for (const v of val) scan(v);
		};
		for (const a of args) scan(a);
		for (const [list, type] of pairs) {
			for (const item of list) {
				const btn = document.createElement("div");
				btn.classList.add("button");
				// @ts-expect-error headless link
				btn.link = item;
				// @ts-expect-error headless type
				btn.type = type;
				// @ts-expect-error ignore
				btn.owner = node;
				// @ts-expect-error ignore
				node.buttons.push(btn);
				content.appendChild(btn);
			}
		}
		// keep last dialog accessible
		ui.dialog = node as any;
		ui.dialogs ??= [];
		ui.dialogs.push(node);
		return node as any;
	};
	ui.create.control = () => {
		const node = makeDiv();
		// @ts-expect-error ignore
		node.close = () => {};
		// @ts-expect-error ignore
		node.delete = () => node.remove();
		// @ts-expect-error ignore
		node.replace = () => {};
		return node as any;
	};
	ui.create.arena = () => {
		ui.window = document.getElementById("window") || document.body;
		ui.dialogs ??= [];
		ui.arena = makeDiv("arena");
		// ui.create.players expects this
		// @ts-expect-error headless stub
		ui.arena.setNumber = () => {};
		ui.window.appendChild(ui.arena);
		ui.control = makeDiv("control");
		// @ts-expect-error ignore
		ui.control.show = () => {};
		// @ts-expect-error ignore
		ui.control.hide = () => {};
		ui.arena.appendChild(ui.control);
		ui.cardPile = makeDiv("cardPile");
		ui.arena.appendChild(ui.cardPile);
		ui.discardPile = makeDiv("discardPile");
		ui.arena.appendChild(ui.discardPile);
		ui.cardPileButton = makeDiv("cardPileButton");
		ui.commonCardPileButton = makeDiv("commonCardPileButton");
		ui.playerids = makeDiv("playerids");
		ui.arena.appendChild(ui.playerids);
		ui.me = makeDiv("me");
		ui.mebg = makeDiv("mebg");
		ui.autonode = makeDiv("autonode");
		ui.historybar = makeDiv("historybar");
		ui.pause = makeDiv("pausebutton");
		ui.wuxie = makeDiv("wuxie");
		ui.tempnowuxie = makeDiv("tempnowuxie");
		ui.system = makeDiv("system");
		ui.selected = { cards: [], targets: [], buttons: [] };
	};
	game.addVideo = () => {};
	game.playAudio = () => {};
	game.playVideo = () => {};
	game.delay = async () => {};
	game.delayx = async () => {};
	game.reload = () => {};
	game.reload2 = () => {};

	game.checkFile = function (_file: string, callback?: (result: -1 | 0 | 1) => void) {
		callback?.(-1);
	};
	game.checkDir = function (_dir: string, callback?: (result: -1 | 0 | 1) => void) {
		callback?.(-1);
	};
	game.getFileList = function (_dir: string, success?: (folders: string[], files: string[]) => void) {
		success?.([], []);
	};
	game.readFileAsText = function (_filename: string, _callback?: (data: string) => void, onerror?: (err: Error) => void) {
		onerror?.(new Error("readFileAsText not supported in headless"));
	};

	if (lib.init?.promises?.css) {
		lib.init.promises.css = async () => ({}) as any;
	}
	if (lib.init?.css) {
		lib.init.css = async () => ({}) as any;
	}
	if (lib.init?.js) {
		lib.init.js = (path: string, file?: string | string[], onLoad?: () => void, onError?: (e: Error) => void) => {
			if (path[path.length - 1] == "/") {
				path = path.slice(0, path.length - 1);
			}
			if (Array.isArray(file)) {
				file.forEach(value => lib.init.js(path, value, onLoad, onError));
				return;
			}
			let scriptSource = file ? `${path}${/^db:extension-[^:]*$/.test(path) ? ":" : "/"}${file}.js` : path;
			try {
				if (scriptSource.startsWith("db:")) {
					onError?.(new Error("db: resources are not supported in headless"));
					return;
				}
				const url = scriptSource.startsWith("http") || scriptSource.startsWith("file:")
					? scriptSource
					: new URL(scriptSource, rootURL).href;
				const filePath = fileURLToPath(url);
				readFile(filePath, "utf8")
					.then(code => {
						vm.runInThisContext(code, { filename: filePath });
						onLoad?.();
					})
					.catch(err => onError?.(err));
			} catch (e: any) {
				onError?.(e);
			}
		};
	}
	if (lib.init?.json) {
		lib.init.json = (url: string, onload?: (data: any) => void, onerror?: (e: Error) => void) => {
			try {
				const resolved = url.startsWith("http") || url.startsWith("file:")
					? url
					: new URL(url, rootURL).href;
				if (resolved.startsWith("file:")) {
					const filePath = fileURLToPath(resolved);
					readFile(filePath, "utf8")
						.then(text => JSON.parse(text))
						.then(obj => onload?.(obj))
						.catch(err => onerror?.(err));
					return;
				}
			} catch (e: any) {
				onerror?.(e);
				return;
			}
			onerror?.(new Error(`Unsupported json url: ${url}`));
		};
	}

	const bootTimeoutMs = Number(process.env.NONAME_BOOT_TIMEOUT_MS || "0");
	if (bootTimeoutMs > 0) {
		await Promise.race([
			boot(),
			new Promise(resolve => setTimeout(resolve, bootTimeoutMs)).then(() => {
				log("boot timeout");
				flog("boot timeout");
			}),
		]);
	} else {
		await boot();
	}
	log("boot done");
	flog("boot done");
	try {
		if (!ui.arena) {
			ui.create.arena();
		}
	} catch {}

	lib.config.mode = hello.mode;
	lib.config.mode_config[lib.config.mode] ??= {};
	for (const k in lib.config.mode_config.global) {
		lib.config.mode_config[lib.config.mode][k] ??= lib.config.mode_config.global[k];
	}
	if (lib.config.mode === "single") {
		lib.config.mode_config.single.single_mode = (hello as any).single_mode ?? "normal";
	}
	lib.storage ??= {};
	lib.storage.choice ??= {};

	_status.auto = false;
	game.modeSwapPlayer = player => {
		game.me = player;
	};
	if (lib.element?.Player?.prototype) {
		lib.element.Player.prototype.isUnderControl = function () {
			return true;
		};
	}
	if (lib.element?.GameEvent?.prototype) {
		lib.element.GameEvent.prototype.isMine = function () {
			return true;
		};
	}
	if (_status.eventManager?.setStatusEvent) {
		const origSetStatusEvent = _status.eventManager.setStatusEvent.bind(_status.eventManager);
		_status.eventManager.setStatusEvent = (event: any, internal: boolean = false) => {
			try {
				return origSetStatusEvent(event, internal);
			} catch {
				// headless: allow replacing status event during mode switch
				if (!_status.eventManager.eventStack) {
					_status.eventManager.eventStack = [];
				}
				_status.eventManager.rootEvent = event;
				_status.eventManager.eventStack = [event];
			}
		};
	}

	try {
		game.switchMode(lib.config.mode);
		log(`switchMode ${lib.config.mode} called`);
		flog(`switchMode ${lib.config.mode} called`);
	} catch (e: any) {
		process.stderr.write(`[headless] switchMode error: ${e?.stack || e}\n`);
		flog(`switchMode error: ${e?.stack || e}`);
		throw e;
	}

	const playersTimeoutMs = Number(process.env.NONAME_PLAYERS_TIMEOUT_MS || "3000");
	await Promise.race([
		(async () => {
			while (!game.players || game.players.length === 0) {
				await new Promise(r => setTimeout(r, 0));
			}
		})(),
		new Promise(r => setTimeout(r, playersTimeoutMs)),
	]);
	log(`players=${game.players?.length ?? 0}`);

	if (game.players && game.players.length) {
		game.me = game.players[Math.max(0, Math.min(game.players.length - 1, hello.seat))];
		for (const p of game.players) {
			p.isUnderControl = () => true;
		}
	}

	setInterval(() => {
		if (!game.me && game.players && game.players.length) {
			game.me = game.players[Math.max(0, Math.min(game.players.length - 1, hello.seat))];
			for (const p of game.players) {
				p.isUnderControl = () => true;
			}
		}
	}, 200);

	const pausedLatch = makeLatch<void>();
	const overLatch = makeLatch<boolean | null>();

	const origPause = game.pause.bind(game);
	game.pause = function () {
		const ret = origPause();
		pausedLatch.fire();
		return ret;
	};

	const origOver = game.over.bind(game);
	game.over = function (result: any, bool: any) {
		try {
			overLatch.fire(typeof bool === "boolean" ? bool : null);
		} catch {}
		return origOver(result, bool);
	};

	if (process.env.NONAME_FORCE_PAUSE === "1") {
		setTimeout(() => {
			if (!_status.paused && !_status.over) {
				game.pause();
			}
		}, 0);
	}

	const getHandElems = () => (game.me ? (game.me.getCards?.("h") || []) : []) as any[];
	const getPlayerElems = () => (game.players || []) as any[];
	const getButtonElems = () => ((ui.dialog?.buttons || []) as any[]).slice(0, Bmax);

	const enabledControl = (link: "ok" | "cancel") => {
		const nodes = ui.control?.querySelectorAll?.(".control") || [];
		for (const n of Array.from(nodes) as any[]) {
			if (n.link === link) {
				const parent = n.parentNode as any;
				if (parent?.classList?.contains?.("disabled")) return false;
				if (parent?.classList?.contains?.("hidden")) return false;
				return true;
			}
		}
		return false;
	};

	const clickControl = (link: "ok" | "cancel") => {
		const nodes = ui.control?.querySelectorAll?.(".control") || [];
		for (const n of Array.from(nodes) as any[]) {
			if (n.link === link) {
				ui.click.control.call(n);
				return;
			}
		}
	};

	const buildObsAndMask = () => {
		const players = getPlayerElems();
		const hand = getHandElems();
		const buttons = getButtonElems();

		const obs: number[] = [];

		for (let i = 0; i < Pmax; i++) {
			const p = players[i];
			if (!p) {
				obs.push(0, 0, 0, 0, 1);
				continue;
			}
			const hp = p.hp ?? 0;
			const maxHp = p.maxHp ?? p.maxhp ?? 0;
			const hc = (p.countCards?.("h") ?? 0) as number;
			const ec = (p.countCards?.("e") ?? 0) as number;
			const dead = p.isDead?.() ? 1 : 0;
			obs.push(hp, maxHp, hc, ec, dead);
		}

		for (let i = 0; i < Hmax; i++) {
			const c = hand[i];
			if (!c) {
				obs.push(0, 0, 0);
				continue;
			}
			const name = c.name ? String(c.name) : "";
			const suit = suitId(c.suit);
			const num = c.number ? Number(c.number) : 0;
			obs.push(hash32(name) % 4096, suit, num);
		}

		const evt = get.event?.() as any;
		const evtName = evt?.name ? String(evt.name) : "";
		obs.push(hash32(evtName) % 256);
		obs.push(_status?.phase ? hash32(String(_status.phase)) % 256 : 0);

		const mask = new Array<number>(A).fill(0);

		for (let i = 0; i < Hmax; i++) {
			const c = hand[i];
			if (c && c.classList?.contains?.("selectable")) mask[i] = 1;
		}

		for (let i = 0; i < Pmax; i++) {
			const p = players[i];
			if (p && p.classList?.contains?.("selectable")) mask[Hmax + i] = 1;
		}

		for (let i = 0; i < Bmax; i++) {
			const b = buttons[i];
			if (b && b.classList?.contains?.("selectable")) mask[Hmax + Pmax + i] = 1;
		}

		mask[Hmax + Pmax + Bmax] = enabledControl("ok") ? 1 : 0;
		mask[Hmax + Pmax + Bmax + 1] = enabledControl("cancel") ? 1 : 0;

		return { obs, mask };
	};

	const buildSnapshot = () => {
		const evt = get.event?.() as any;
		const players = (game.players || []).map((p: any, idx: number) => ({
			index: idx,
			playerid: p?.playerid ?? null,
			name: p?.name ?? null,
			name2: p?.name2 ?? null,
			hp: p?.hp ?? 0,
			maxHp: p?.maxHp ?? p?.maxhp ?? 0,
			handCount: p?.countCards?.("h") ?? 0,
			equipCount: p?.countCards?.("e") ?? 0,
			dead: !!p?.isDead?.(),
			selectable: !!p?.classList?.contains?.("selectable"),
		}));
		const me = game.me;
		const hand = (me?.getCards?.("h") || []).map((c: any, idx: number) => ({
			index: idx,
			name: c?.name ?? null,
			suit: c?.suit ?? null,
			number: c?.number ?? 0,
			selectable: !!c?.classList?.contains?.("selectable"),
		}));
		const { obs, mask } = buildObsAndMask();
		return {
			event: evt?.name ?? null,
			paused: !!_status.paused,
			over: !!_status.over,
			currentPlayerId: evt?.player?.playerid ?? null,
			mePlayerId: me?.playerid ?? null,
			players,
			hand,
			obs,
			mask,
		};
	};

	let initialSent = false;
	const sendInitial = () => {
		if (initialSent) return;
		initialSent = true;
		try {
			const { obs, mask } = buildObsAndMask();
			process.stdout.write(JSON.stringify({ obs, mask, reward: 0, done: !!_status.over }) + "\n");
		} catch (e: any) {
			process.stderr.write(`[headless] initial emit error: ${e?.stack || e}\n`);
			process.stdout.write(JSON.stringify({ obs: [0, 0, 0, 0], mask: [0], reward: 0, done: false }) + "\n");
		}
		if (_status.over) process.exit(0);
	};

	const initialWaitMs = Number(process.env.NONAME_INITIAL_WAIT_MS || "3000");
	await Promise.race([
		pausedLatch.wait(),
		overLatch.wait(),
		new Promise(resolve => setTimeout(resolve, initialWaitMs)),
	]);
	log("paused or over reached");
	sendInitial();

	while (true) {
		const line = await readLine();
		if (line == null) break;
		if (!line.trim()) continue;
		const msg: StepMsg = JSON.parse(line);
		if (msg.cmd === "snapshot") {
			process.stdout.write(JSON.stringify({ snapshot: buildSnapshot() }) + "\n");
			continue;
		}
		if (msg.cmd !== "step") {
			process.stdout.write(JSON.stringify({ error: "unknown_cmd" }) + "\n");
			continue;
		}

		const hand = getHandElems();
		const players = getPlayerElems();
		const buttons = getButtonElems();

		const okIndex = Hmax + Pmax + Bmax;
		const cancelIndex = okIndex + 1;

		if (msg.action < Hmax) {
			const c = hand[msg.action];
			if (c) ui.click.card.call(c);
		} else if (msg.action < Hmax + Pmax) {
			const p = players[msg.action - Hmax];
			if (p) ui.click.target.call(p);
		} else if (msg.action < Hmax + Pmax + Bmax) {
			const b = buttons[msg.action - Hmax - Pmax];
			if (b) ui.click.button.call(b);
		} else if (msg.action === okIndex) {
			clickControl("ok");
		} else if (msg.action === cancelIndex) {
			clickControl("cancel");
		}

		if (_status.paused && !_status.over) {
			const { obs, mask } = buildObsAndMask();
			process.stdout.write(JSON.stringify({ obs, mask, reward: 0, done: false }) + "\n");
			continue;
		}

		const stepTimeoutMs = Number(process.env.NONAME_STEP_TIMEOUT_MS || "3000");
		const overBool = await Promise.race([
			pausedLatch.wait().then(() => null),
			overLatch.wait().then(v => v),
			new Promise<null>(resolve => setTimeout(() => resolve(null), stepTimeoutMs)),
		]);

		const done = !!_status.over;
		let reward = 0;
		if (done) {
			if (overBool === true) reward = 1;
			else if (overBool === false) reward = -1;
			else reward = 0;
		}

		const { obs, mask } = buildObsAndMask();
		process.stdout.write(JSON.stringify({ obs, mask, reward, done }) + "\n");

		if (done) process.exit(0);
	}
}

main().catch(e => {
	process.stderr.write(String((e as any)?.stack || e) + "\n");
	process.exit(1);
});
