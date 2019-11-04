import axios from "axios";
import cheerio from "cheerio";
import AWS from "aws-sdk";

const region = process.env.AWS_REGION;
AWS.config.update({ region });
var DDB = new AWS.DynamoDB({ apiVersion: "2012-10-08" });

const baseUrl = "https://www.wowprogress.com";
const lfgUrl = `${baseUrl}/gearscore/us?lfg=1&sortby=ts`;

const tableName = process.env.tableName;

const daysUntilExpiration = 3;
const secondsUntilExpiration = 60 * 60 * 24 * daysUntilExpiration;
const pollInterval = 5;

export function main(event, context, callback) {
  console.log("Attempting to contact endpoint.");
  axios.get(lfgUrl).then(response => {
    let $ = cheerio.load(response.data);
    console.log("Successfully connected to endpoint, checking for new data.");
    $("#char_rating_container tr:not(:first-child)").each((i, character) => {
      // Check if this record is new
      const postedTime = $("td:nth-child(6) span", character).text();
      const splitArr = postedTime.split(" ");
      const timeValue = parseInt(splitArr[0]);
      const timeUnit = splitArr[1];

      if (
        timeValue > 3 * pollInterval ||
        (timeUnit !== "minutes" && timeUnit !== "minute")
      ) {
        console.log(
          "No new characters have been posted within the time window. Exiting."
        );
        return false;
      }

      console.log(
        "Still within time window. Checking to see if this is a repost."
      );

      const nameField = $("td:nth-child(1) a", character);
      const characterName = nameField.text();
      const characterUrl = baseUrl + nameField.attr("href");
      const characterRealm = $("td:nth-child(4) a", character).text();

      const currentTime = Math.floor(Date.now() / 1000);

      var getParams = {
        TableName: tableName,
        Key: {
          Name: { S: characterName },
          Realm: { S: characterRealm }
        }
      };

      DDB.getItem(getParams, function(err, data) {
        if (err) {
          console.log(err, err.stack);
        } else {
          // Check if in database, make sure TTL hasn't expired
          if (data.Item && data.Item.TTL && currentTime < data.Item.TTL.N) {
            console.log(
              "Character already found (" + characterName + "), skipping."
            );
          } else {
            console.log("New character found: " + characterName);
            // Calculate expiration time
            const timeToLive = currentTime + secondsUntilExpiration;

            let putParams = {
              TableName: tableName,
              Item: {
                Name: { S: characterName },
                Realm: { S: characterRealm },
                Url: { S: characterUrl },
                TTL: { N: JSON.stringify(timeToLive) },
                CreatedTime: { N: JSON.stringify(currentTime) }
              }
            };

            console.log(
              "Attempting to get data for character: " + characterName
            );
            // Go to character url and get info box
            axios.get(characterUrl).then(response => {
              let $ = cheerio.load(response.data);
              console.log(
                "Successfully got data for character: " + characterName
              );
              const characterInfoField = $(".charCommentary").text();

              if (characterInfoField) {
                putParams.Item.Info = { S: characterInfoField };
              }

              console.log(
                "Attempting to insert new character into database: " +
                  characterName
              );
              DDB.putItem(putParams, function(err, data) {
                if (err) {
                  console.log(
                    "Error creating new record for character: " + characterName
                  );
                  console.log(err, err.stack);
                } else {
                  console.log("Successfully added character: " + characterName);
                }
              });
            });
          }
        }
      });
    });
  });
}
