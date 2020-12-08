const config = require("../config.json");
const logger = require("pino")({
  level: config.logLevel,
  prettyPrint: config.prettyPrint,
});

const transporter = require("./mail").transporter;

const number = process.env.PHONE_NUMBER;
const carrierGateway = process.env.PHONE_CARRIER_GATEWAY;
const user = process.env.EMAIL_USERNAME;
const to = `${number}@${carrierGateway}`;

async function sms(subject, message) {
  const mailOptions = {
    subject,
    to,
    from: user,
    text: message,
  };

  return transporter.sendMail(mailOptions, (error) => {
    if (error) {
      logger.error(error, "✖ couldn't send sms");
    } else {
      logger.info("✔ sms sent");
    }
  });
}

module.exports = sms;
