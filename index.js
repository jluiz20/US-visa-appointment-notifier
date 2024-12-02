const puppeteer = require('puppeteer');
const {format} = require('date-fns')
require('dotenv').config();
const fs = require('fs');
const R = require('ramda')

const {delay, sendEmail, logStep} = require('./utils');
const {
    IS_PROD,
    NEXT_SCHEDULE_POLL_MIN,
    MAX_NUMBER_OF_POLL,
    DATES,
    SLEEP_HOUR,
    WAKEUP_HOUR
} = require('./config');

let maxTries = MAX_NUMBER_OF_POLL

const notifyMe = async (availability) => {
    const formattedDate = format(R.prop('start_at')(availability), 'dd-MM-yyyy HH:mm');
    const available = R.prop('approximate_available_capacity')(availability);
    logStep(`sending an email for availability on ${formattedDate} for ${available} people`);
    await sendEmail({
        subject: `We found an available time on ${formattedDate} for ${available} people`,
        text: `Hurry and schedule for ${formattedDate} before it is taken.`
    })
}

const checkForAvailabilities = async (page, date) => {
    logStep('checking for availabilities');
    await page.goto(`https://fareharbor.com/api/v1/companies/leavenworthreindeer/search/availabilities/date/${date}/?allow_grouped=yes&bookable_only=no&flow=17645`);

    const originalPageContent = await page.content();
    const bodyText = await page.evaluate(() => {
        return document.querySelector('body').innerText
    });

    try {
        const parsedBody = JSON.parse(bodyText);
        if (!Array.isArray(parsedBody.availabilities)) {
            throw "Failed to parse dates, probably because you are not logged in";
        }
        return R.pipe(
            R.filter(R.propSatisfies(capacity => capacity >= 2, 'approximate_available_capacity')),
            R.map(R.pick(['approximate_available_capacity', 'start_at']))
        )(parsedBody.availabilities);
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
        for (const date of JSON.parse(DATES)) {
            try {
                const page = await browser.newPage();

                const availableTimes = await checkForAvailabilities(page, date);
                logStep(`availableTimes result is ${availableTimes}`)

                const row = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString() + "," + availableTimes + "\n"

                fs.appendFile('./dates.csv', row, err => {
                    if (err) {
                        console.error(err);
                    }
                });

                if (R.not(R.isEmpty(availableTimes))) {
                    R.forEach(await notifyMe)(availableTimes)
                }

            } catch (err) {
                console.error(err);
            }

            await new Promise(r => setTimeout(r, 2000));
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
