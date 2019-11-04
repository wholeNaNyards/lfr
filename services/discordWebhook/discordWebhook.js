import axios from "axios";
import AWS from "aws-sdk";

const region = process.env.AWS_REGION;
AWS.config.update({ region });
var DDB = new AWS.DynamoDB({ apiVersion: "2012-10-08" });

const { tableName } = process.env;
const characterDataEndpoint =
  "https://raider.io/api/v1/characters/profile?region=us";
const webhookEndpoint = "https://discordapp.com/api/webhooks";

const classColorMap = {
  "Death Knight": "12853051",
  "Demon Hunter": "10694857",
  Druid: "16743690",
  Hunter: "11261043",
  Mage: "04245483",
  Monk: "00065430",
  Paladin: "16092346",
  Priest: "16777215",
  Rogue: "16774505",
  Shaman: "00028894",
  Warlock: "08882157",
  Warrior: "13081710"
};

export function main(event, context, callback) {
  event.Records.forEach(record => {
    // Only trigger this lambda if an Insert into the table occurred
    if (record.eventName == "INSERT") {
      const characterName = record.dynamodb.NewImage.Name.S;
      const characterRealm = record.dynamodb.NewImage.Realm.S;

      const characterInfo = record.dynamodb.NewImage.Info
        ? record.dynamodb.NewImage.Info.S
        : "";
      const characterUrl = record.dynamodb.NewImage.Url.S;

      console.log("Fetching data for character: " + characterName);

      const url = `${characterDataEndpoint}&name=${characterName}&realm=${characterRealm}&fields=gear,raid_progression,mythic_plus_best_runs`;

      axios
        .get(url)
        .then(function({ data: characterData }) {
          console.log("Successfully fetched character data.");

          console.log("Attempting to read from Alerts table.");
          // Loop through each Alert settings, either returning or creating Webhook
          DDB.scan({ TableName: tableName }, function(err, alerts) {
            if (err) {
              console.log("Error connecting to Alerts table.");
              console.log(err, err.stack);
            } else {
              if (
                alerts &&
                alerts.Items &&
                Array.isArray(alerts.Items) &&
                alerts.Items.length
              ) {
                console.log("Successfully found items in Alerts table.");

                console.log("Start of loop through each Alert");
                alerts.Items.forEach(alert => {
                  const webhookId = alert.webhookId.S;
                  const webhookToken = alert.webhookToken.S;
                  const alertSettings = JSON.parse(alert.alertSettings.S);

                  // Check if this character matches the Selected Faction
                  const characterFaction = characterData.faction.toLowerCase();
                  if (
                    alertSettings.selectedFaction !== "both" &&
                    characterFaction !== alertSettings.selectedFaction
                  ) {
                    console.log("Faction doesn't match, skipping.");
                    console.log("characterFaction: ", characterFaction);
                    console.log(
                      "alertSettings.selectedFaction: ",
                      alertSettings.selectedFaction
                    );
                    return;
                  }

                  // Check if this character matches the Selected Realm
                  const characterRealmSafe = characterRealm
                    .replace("'", "")
                    .replace(" ", "-")
                    .toLowerCase();
                  if (
                    alertSettings.selectedRealm !== "any" &&
                    characterRealmSafe !== alertSettings.selectedRealm
                  ) {
                    console.log("Realm doesn't match, skipping.");
                    console.log("characterRealmSafe: ", characterRealmSafe);
                    console.log(
                      "alertSettings.selectedRealm: ",
                      alertSettings.selectedRealm
                    );
                    return;
                  }

                  // Check if this character matches the Selected iLvl
                  const characterILvl = characterData.gear.item_level_equipped;
                  if (
                    alertSettings.selectedILvl !== "any" &&
                    characterILvl < parseInt(alertSettings.selectedILvl)
                  ) {
                    console.log("iLvl doesn't match, skipping.");
                    console.log("characterILvl: ", characterILvl);
                    console.log(
                      "alertSettings.selectedILvl: ",
                      alertSettings.selectedILvl
                    );
                    return;
                  }

                  // Check if this character matches the Selected Classes
                  const characterClass = characterData.class;
                  if (
                    alertSettings.selectedClassOptions !== "all" &&
                    !alertSettings.selectedClasses.includes(
                      characterClass
                        .split(" ")
                        .join("-")
                        .toLowerCase()
                    )
                  ) {
                    console.log("Class doesn't match, skipping.");
                    console.log("characterClass: ", characterClass);
                    console.log(
                      "alertSettings.selectedClasses: ",
                      JSON.stringify(alertSettings.selectedClasses)
                    );
                    return;
                  }

                  // Check if this character matches the Selected Progression
                  const characterTEPData =
                    characterData.raid_progression["the-eternal-palace"];
                  const characterBoDData =
                    characterData.raid_progression["battle-of-dazaralor"];
                  if (
                    alertSettings.selectedProgressionOptions !== "any" &&
                    (characterTEPData["mythic_bosses_killed"] <
                      parseInt(alertSettings.selectedProgressionTEPM) ||
                      characterTEPData["heroic_bosses_killed"] <
                        parseInt(alertSettings.selectedProgressionTEPH) ||
                      characterBoDData["mythic_bosses_killed"] <
                        parseInt(alertSettings.selectedProgressionBoDM) ||
                      characterBoDData["heroic_bosses_killed"] <
                        parseInt(alertSettings.selectedProgressionBoDH))
                  ) {
                    console.log("Progression doesn't match, skipping.");
                    console.log(
                      "characterTEPData['mythic_bosses_killed']: ",
                      characterTEPData["mythic_bosses_killed"]
                    );
                    console.log(
                      "alertSettings.selectedProgressionTEPM: ",
                      alertSettings.selectedProgressionTEPM
                    );
                    console.log(
                      "characterTEPData['heroic_bosses_killed']: ",
                      characterTEPData["heroic_bosses_killed"]
                    );
                    console.log(
                      "alertSettings.selectedProgressionTEPH: ",
                      alertSettings.selectedProgressionTEPH
                    );
                    console.log(
                      "characterBoDData['mythic_bosses_killed']: ",
                      characterBoDData["mythic_bosses_killed"]
                    );
                    console.log(
                      "alertSettings.selectedProgressionBoDM: ",
                      alertSettings.selectedProgressionBoDM
                    );
                    console.log(
                      "characterBoDData['heroic_bosses_killed']: ",
                      characterBoDData["heroic_bosses_killed"]
                    );
                    console.log(
                      "alertSettings.selectedProgressionBoDH: ",
                      alertSettings.selectedProgressionBoDH
                    );
                    return;
                  }

                  let characterRace = characterData.race;

                  if (characterRace === "Pandaren") {
                    if (characterFaction === "alliance") {
                      characterRace = "Alliance " + characterRace;
                    } else {
                      characterRace = "Horde " + characterRace;
                    }
                  }

                  const characterColor = classColorMap[characterClass];
                  const characterThumbnail = characterData.thumbnail_url;
                  const characterUldirProgression =
                    characterData.raid_progression["uldir"].summary;
                  const characterBoDProgression = characterBoDData.summary;
                  const characterCrucibleProgression =
                    characterData.raid_progression["crucible-of-storms"]
                      .summary;
                  const characterTEPProgression = characterTEPData.summary;

                  const filteredDungeons = characterData.mythic_plus_best_runs.filter(
                    dungeon => dungeon.num_keystone_upgrades > 0
                  );

                  let dungeons = characterData.mythic_plus_best_runs;

                  if (filteredDungeons && filteredDungeons.length > 0) {
                    dungeons = filteredDungeons;
                  }

                  let bestDungeon = dungeons[0];

                  for (let i = 1; i < dungeons.length; i++) {
                    const dungeon = dungeons[i];

                    if (dungeon.mythic_level > bestDungeon.mythic_level) {
                      bestDungeon = dungeon;
                    } else if (
                      dungeon.mythic_level === bestDungeon.mythic_level
                    ) {
                      if (dungeon.clear_time_ms < bestDungeon.clear_time_ms) {
                        bestDungeon = dungeon;
                      }
                    }
                  }

                  let dungeonKeyUpgrade = "";
                  for (let i = 0; i < bestDungeon.num_keystone_upgrades; i++) {
                    dungeonKeyUpgrade += "+";
                  }

                  const dungeonLevel =
                    dungeonKeyUpgrade + bestDungeon.mythic_level;
                  const dungeonName = bestDungeon.short_name;

                  const dungeonTime = msToTime(bestDungeon.clear_time_ms);

                  const armoryLink = `https://worldofwarcraft.com/en-us/character/${characterRealmSafe}/${characterName}`;
                  const wowProgressLink = `https://www.wowprogress.com/character/us/${characterRealmSafe}/${characterName}`;
                  const raiderIOLink = `https://raider.io/characters/us/${characterRealmSafe}/${characterName}`;
                  const warcraftLogsLink = `https://www.warcraftlogs.com/character/us/${characterRealmSafe}/${characterName}`;

                  const payload = {
                    content: "We found a player for you!",
                    username: "LFR Bot",
                    embeds: [
                      {
                        author: {
                          name: `${characterName} - ${characterRealm} (US) | ${characterRace} ${characterData.active_spec_name} ${characterClass} | ${characterILvl} ilvl`,
                          url: characterUrl
                        },
                        color: characterColor,
                        thumbnail: {
                          url: characterThumbnail
                        },
                        fields: [
                          {
                            name: "__Recent Raid Progression__",
                            value: `**Uldir:** ${characterUldirProgression}\n**Battle of Dazar'alor:** ${characterBoDProgression}\n**Crucible of Storms:** ${characterCrucibleProgression}\n**The Eternal Palace:** ${characterTEPProgression}`,
                            inline: true
                          },
                          {
                            name: "__Best M+ Dungeon__",
                            value: `**${dungeonLevel}** - ${dungeonName} - ${dungeonTime}`,
                            inline: true
                          },
                          {
                            name: "__Bio__",
                            value: characterInfo
                              ? characterInfo
                              : "No bio posted..."
                          },
                          {
                            name: "__External Sites__",
                            value: `[Armory](${armoryLink}) | [RaiderIO](${raiderIOLink}) | [WoWProgress](${wowProgressLink}) | [WarcraftLogs](${warcraftLogsLink})`
                          },
                          {
                            name: "__Original Posting__",
                            value: characterUrl
                          },
                          {
                            name: "__More...__",
                            value:
                              "Edit and customize these alert settings at [lookingforraid.io](https://lookingforraid.io)."
                          }
                        ]
                      }
                    ]
                  };

                  axios
                    .post(
                      `${webhookEndpoint}/${webhookId}/${webhookToken}`,
                      payload
                    )
                    .then(function(response) {
                      console.log("Webhook sent.");
                    })
                    .catch(function(error) {
                      console.log("Error sending webhook", error);
                    });
                });
              } else {
                console.log("No entries found in Alerts table.");
              }
            }
          });
        })
        .catch(function(error) {
          console.log(error);
        });
    }
  });
}

// From https://stackoverflow.com/questions/19700283/how-to-convert-time-milliseconds-to-hours-min-sec-format-in-javascript
function msToTime(duration) {
  var seconds = parseInt((duration / 1000) % 60),
    minutes = parseInt((duration / (1000 * 60)) % 60),
    hours = parseInt((duration / (1000 * 60 * 60)) % 24);

  minutes = minutes < 10 ? "0" + minutes : minutes;
  seconds = seconds < 10 ? "0" + seconds : seconds;

  if (hours === 0) {
    return minutes + ":" + seconds;
  }

  hours = hours < 10 ? "0" + hours : hours;

  return hours + ":" + minutes + ":" + seconds;
}
