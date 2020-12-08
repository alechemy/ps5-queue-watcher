require('dotenv').config()
const { app, BrowserWindow, session } = require('electron');
const fetch = require('electron-fetch').default;
const sleep = require('./lib/sleep');
const notify = require('./lib/notify');
const { mail } = require('./lib/mail');
const sms = require('./lib/sms');
const cons = require('./constants');
const config = require('./config.json');
const logger = require('pino')({ level: config.logLevel, prettyPrint: config.prettyPrint });

let ses;

async function generateID() {
	// calculate scaling values
	const timestamp = new Date().getTime();
	const requestLength = cons.baseRespEnd - cons.baseReqStart;
	const latency = cons.baseRespStart - cons.baseReqStart;
	const processTime = cons.baseRespEnd - cons.baseRespStart;
	
	// generate simulated timestamp info
	const idBody = [{
		...cons.idBodyTemp[0], 
		requestStart: (timestamp - requestLength), 
		responseStart: (timestamp - requestLength) + latency,
		responseEnd: ((timestamp - requestLength) + latency) + processTime
	}]
	
	try {
		const res = await fetch(cons.idURL, {
			method: "post",
			body:	JSON.stringify(idBody),
			session: ses,
			useSessionCookies: true,
		});

		return res.headers.get(cons.queueIDHdr);
	} catch (e) {
		return e;
	}
}

async function checkStatus(queueID) {
	const statusURL = cons.baseStatusURL.replace(cons.baseID, queueID);
	try {
		const res = await fetch(statusURL, {
			method: "post",
			body:	JSON.stringify(cons.statusBody),
			headers: { 'Content-Type': 'application/json' },
			session: ses,
			useSessionCookies: true,
		});
	
		const json = await res.json();
		const redir = json.redirectUrl;
		const msg = json.message;
		const ticket = json.ticket;
		
		if (redir) return {status: cons.errors.CAPTCHA, redir: redir};
		if (msg) {
			logger.trace(msg);
			const text = msg.text.toLowerCase();
			if (!text.includes(cons.oosMsg)) return {status: cons.errors.MESSAGE, msg: text};
		}
		if (ticket) {
			logger.trace(ticket);
			if (ticket.whichIsIn != "less than a minute" || ticket.usersInQueue > 0) return {status: cons.errors.QUEUE};
		}
		return {status: cons.errors.OK};
	} catch (e) {
		return e;
	}
}

async function doCaptcha(redir) {
	return new Promise(resolve => {
		const win = new BrowserWindow({
			width: 800,
			height: 600,
			webPreferences: {
				session: ses,
				contextIsolation: true,
				nodeIntegration: false,
			}
		});
		win.on('closed', _ => {
			resolve();
		});
		win.loadURL(cons.captchaPrefix + redir);
	});
}

async function queue() {
	ses = session.fromPartition('persist:playstation');
	let queueID = "";
	while (!queueID) {
		queueID = await generateID();
		if (!queueID) {
			logger.debug(`failed to generate queue ID, retrying in ${cons.refreshTime} seconds`);
			await sleep(cons.refreshTime * 1000);
		};
	}
	
	let err;
	while (true) {
		err = await checkStatus(queueID);
		let title;
		let message;
		switch (err.status) {
		case cons.errors.OK:
			break;
		case cons.errors.CAPTCHA:
			logger.info("need to do captcha!");
			title = "Captcha required";
			message = "Go do the captcha!";
			notify(title, message);
			mail(title, message);
			sms(title, message);
			await doCaptcha(err.redir);
			logger.info("captcha window closed");
			break;
		case cons.errors.MESSAGE:
			logger.info("message found!");
			title = "Queue message found!";
			message = "Go to the site!";
			notify(title, message);
			mail(title, message);
			sms(title, message);
			break;
		case cons.errors.QUEUE:
			logger.info("updated queue info found!");
			title = "Queue info changed!";
			message = "Go to the site!";
			notify(title, message);
			mail(title, message);
			sms(title, message);
			break;
		default:
			logger.info("encountered error, restarting session");
			logger.error(err);
			await ses.clearStorageData();
			queueID = "";
			while (!queueID) {
				queueID = await generateID();
				if (!queueID) {
					logger.debug(`failed to generate queue ID, retrying in ${cons.refreshTime} seconds`);
					await sleep(cons.refreshTime * 1000)
				};
			}
			logger.info("new queue id generated");
		}
		await sleep(cons.queueRefresh * 1000);
	}
}

app.on('window-all-closed', () => {
	//logger.debug("dont stop");
})

app.whenReady().then(queue).then(app.quit);