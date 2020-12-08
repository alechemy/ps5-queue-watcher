const config = require("../config.json");
const logger = require("pino")({
  level: config.logLevel,
  prettyPrint: config.prettyPrint,
});
const nodemailer = require("nodemailer");

const to = process.env.EMAIL_TO;
const user = process.env.EMAIL_USERNAME;
const pass = process.env.EMAIL_PASSWORD;

const transporter = nodemailer.createTransport({
  auth: { user, pass },
  service: "gmail",
});

async function mail(subject, message) {
  const mailOptions = {
    subject,
    to,
    from: user,
    text: message,
  };

  return transporter.sendMail(mailOptions, (error) => {
    if (error) {
      logger.error(error, "✖ couldn't send email");
    } else {
      logger.info("✔ email sent");
    }
  });
}

module.exports = { mail, transporter };
