module.exports = {
  IS_PROD: process.env.NODE_ENV === 'prod',
  NEXT_SCHEDULE_POLL_MIN: process.env.NEXT_SCHEDULE_POLL_MIN || 15, // default to 15 minutes
  MAX_NUMBER_OF_POLL: process.env.MAX_NUMBER_OF_POLL || 250, // number of polls before stopping
  SLEEP_HOUR: process.env.SLEEP_HOUR || 22, // in 24-hour format, i.e 23
  WAKEUP_HOUR: process.env.WAKEUP_HOUR || 7, // in 24-hour format, i.e 07
  DATES: process.env.DATES, // an array containing the list of dates to check

  NOTIFY_EMAILS: process.env.NOTIFY_EMAILS, // comma separated list of emails
  mailgun: {
    USERNAME: process.env.MAILGUN_USERNAME,
    DOMAIN: process.env.MAILGUN_DOMAIN,
    API_KEY: process.env.MAILGUN_API_KEY,
  }
}
