import axios from "axios";
import AWS from "aws-sdk";
import qs from "querystring";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://dev.lookingforraid.io",
  "https://lookingforraid.io"
];

const region = process.env.AWS_REGION;
AWS.config.update({ region });
var DDB = new AWS.DynamoDB({ apiVersion: "2012-10-08" });

const tokenUrl = "https://discordapp.com/api/oauth2/token";
const tableName = process.env.tableName;
const client_id = process.env.clientId;
const client_secret = process.env.clientSecret;
const grant_type = "authorization_code";
let redirect_uri = process.env.redirectUri;
const scope = "webhook.incoming";

export function main(event, context, callback) {
  const origin = event.headers.origin;
  let headers;

  if (ALLOWED_ORIGINS.includes(origin)) {
    headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": true
    };
    redirect_uri = origin;
  } else {
    headers = {
      "Access-Control-Allow-Origin": "*"
    };
  }

  const responseError = {
    statusCode: 400,
    headers,
    body: JSON.stringify({
      message: "Error, something went wrong."
    })
  };

  const clientRequestData = JSON.parse(event.body);

  const code = clientRequestData.code;

  console.log("Attempting to get Discord access token.");
  const requestData = {
    client_id,
    client_secret,
    grant_type,
    code,
    redirect_uri,
    scope
  };

  const options = {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  };

  axios
    .post(tokenUrl, qs.stringify(requestData), options)
    .then(response => {
      console.log("Successfully received Discord access token");

      const {
        channel_id: channelId,
        token: webhookToken,
        id: webhookId
      } = response.data.webhook;

      // Delete Webhook Discord just created
      const deleteWebhookUrl = `https://discordapp.com/api/webhooks/${webhookId}/${webhookToken}`;
      axios
        .delete(deleteWebhookUrl)
        .then(response => {
          console.log("Successfully deleted webhook.");

          // Check if Webhook already exists for this channel
          const getParams = {
            TableName: tableName,
            Key: {
              channelId: { S: channelId }
            }
          };

          console.log(
            "Checking to see if Webhook already exists for channelId: ",
            channelId
          );
          DDB.getItem(getParams, function(err, data) {
            if (err) {
              console.log(
                "Error reading from alerts table for channelId: " + channelId
              );
              console.log(err, err.stack);
            } else {
              console.log("ChannelId found, attempting to delete old Webhook.");

              if (
                data.Item &&
                data.Item.channelId &&
                data.Item.webhookId &&
                data.Item.webhookToken
              ) {
                // Delete old Webhook
                const deleteWebhookUrl = `https://discordapp.com/api/webhooks/${data.Item.webhookId.S}/${data.Item.webhookToken.S}`;
                axios
                  .delete(deleteWebhookUrl)
                  .then(response => {
                    console.log("Successfully deleted webhook.");
                    const responseSuccess = {
                      statusCode: 200,
                      headers
                    };
                    callback(null, responseSuccess);
                  })
                  .catch(err => {
                    console.log("Error deleting webhook: ", err);
                    callback(responseError);
                  });
              } else {
                const responseSuccess = {
                  statusCode: 200,
                  headers
                };
                callback(null, responseSuccess);
              }
            }
          });
        })
        .catch(err => {
          console.log("Error deleting webhook: ", err);
          callback(responseError);
        });
    })
    .catch(error => {
      console.log("Error on Discord access token request: ", error);
      callback(responseError);
    });
}
