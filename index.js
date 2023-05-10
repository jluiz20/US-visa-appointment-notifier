const puppeteer = require('puppeteer');
const {parseISO, compareAsc, isBefore, format} = require('date-fns')
require('dotenv').config();
const fs = require('fs');

const {delay, sendEmail, logStep} = require('./utils');
const {
    siteInfo,
    loginCred,
    IS_PROD,
    NEXT_SCHEDULE_POLL_MIN,
    MAX_NUMBER_OF_POLL,
    NOTIFY_ON_DATE_BEFORE,
    SLEEP_HOUR,
    WAKEUP_HOUR
} = require('./config');

let maxTries = MAX_NUMBER_OF_POLL

const login = async (page) => {
    logStep('logging in');
    await page.goto(siteInfo.LOGIN_URL);

    const form = await page.$("form#sign_in_form");

    const email = await form.$('input[name="user[email]"]');
    const password = await form.$('input[name="user[password]"]');
    const privacyTerms = await form.$('input[name="policy_confirmed"]');
    const signInButton = await form.$('input[name="commit"]');

    await email.type(loginCred.EMAIL);
    await password.type(loginCred.PASSWORD);
    await privacyTerms.click();
    await signInButton.click();

    await page.waitForNavigation();

    return true;
}

const notifyMe = async (earliestDate) => {
    const formattedDate = format(earliestDate, 'dd-MM-yyyy');
    logStep(`sending an email to schedule for ${formattedDate}`);
    await sendEmail({
        subject: `We found an earlier date ${formattedDate}`,
        text: `Hurry and schedule for ${formattedDate} before it is taken.`
    })
}

const checkForSchedules = async (page) => {
    logStep('checking for schedules');
    await page.setExtraHTTPHeaders({
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
    });
    await page.goto(siteInfo.APPOINTMENTS_JSON_URL);

    const originalPageContent = await page.content();
    const bodyText = await page.evaluate(() => {
        return document.querySelector('body').innerText
    });

    try {
        const parsedBody = JSON.parse(bodyText);

        if (!Array.isArray(parsedBody)) {
            throw "Failed to parse dates, probably because you are not logged in";
        }

        const dates = parsedBody.map(item => parseISO(item.date));
        const [earliest] = dates.sort(compareAsc)

        return earliest;
    } catch (err) {
        console.log("Unable to parse page JSON content", originalPageContent);
        console.error(err)
    }
}


const process = async () => {
    const browser = await puppeteer.launch(!IS_PROD ? {headless: false} : undefined);

    logStep(`starting process with ${maxTries} tries left`);

    const now = new Date();
    const currentHour = now.getHours()

    if (currentHour >= SLEEP_HOUR || currentHour < WAKEUP_HOUR) {
        logStep("After hours, doing nothing")
    } else {
        try {
            if (maxTries-- <= 0) {
                console.log('Reached Max tries')
                return
            }
            const page = await browser.newPage();

            await login(page);

            const earliestDate = await checkForSchedules(page);
            let earliestDateStr = format(earliestDate, 'yyyy-MM-dd');
            logStep(`Earliest date found is ${earliestDateStr}`)

            let diff = Math.round((earliestDate - now) / (1000 * 60 * 60 * 24))

            const row = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString() + "," + earliestDateStr + "," + diff + "\n"

            fs.appendFile('./dates.csv', row, err => {
                if (err) {
                    console.error(err);
                }
            });

            if (earliestDate && isBefore(earliestDate, parseISO(NOTIFY_ON_DATE_BEFORE))) {
                await notifyMe(earliestDate);
            }

        } catch (err) {
            console.error(err);
        }

        await browser.close();
    }

    logStep(`Sleeping for ${NEXT_SCHEDULE_POLL_MIN} minutes`)

    await delay(NEXT_SCHEDULE_POLL_MIN)

    await process()
}


(async () => {
    try {
        await process();
    } catch (err) {
        console.error(err);
    }
})();
