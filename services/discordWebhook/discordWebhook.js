import axios from "axios";

const webhook = process.env.webhookEndpoint;
const endpoint = process.env.endpoint;
const fields = process.env.fields;

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
    if (record.eventName == "INSERT") {
      const characterName = record.dynamodb.NewImage.Name.S;
      const characterRealm = record.dynamodb.NewImage.Realm.S;
      const characterRealmSafe = characterRealm
        .replace("'", "")
        .replace(" ", "-")
        .toLowerCase();

      const characterInfo = record.dynamodb.NewImage.Info
        ? record.dynamodb.NewImage.Info.S
        : "";
      const characterUrl = record.dynamodb.NewImage.Url.S;

      console.log("Fetching data for character: " + characterName);

      const url = `${endpoint}&name=${characterName}&realm=${characterRealm}&fields=${fields}`;

      axios
        .get(url)
        .then(function({ data }) {
          console.log("Successfully fetched data.");

          if (data.faction.toLowerCase() !== "alliance") {
            console.log(
              "Faction not alliance. Returning. Faction: " + data.faction
            );
            return;
          }

          const characterSpec = data.active_spec_name;
          const characterClass = data.class;
          let characterRace = data.race;

          if (characterRace === "Pandaren") {
            if (data.faction.toLowerCase === "alliance") {
              characterRace = "Alliance " + characterRace;
            } else {
              characterRace = "Horde " + characterRace;
            }
          }

          const characterILvl = data.gear.item_level_equipped;
          const characterColor = classColorMap[characterClass];
          const characterThumbnail = data.thumbnail_url;
          const characterUldirProgression =
            data.raid_progression["uldir"].summary;
          const characterBoDProgression =
            data.raid_progression["battle-of-dazaralor"].summary;
          const characterCrucibleProgression =
            data.raid_progression["crucible-of-storms"].summary;
          const characterTEPProgression =
            data.raid_progression["the-eternal-palace"].summary;

          const filteredDungeons = data.mythic_plus_best_runs.filter(
            dungeon => dungeon.num_keystone_upgrades > 0
          );

          let dungeons = data.mythic_plus_best_runs;

          if (filteredDungeons && filteredDungeons.length > 0) {
            dungeons = filteredDungeons;
          }

          let bestDungeon = dungeons[0];

          for (let i = 1; i < dungeons.length; i++) {
            const dungeon = dungeons[i];

            if (dungeon.mythic_level > bestDungeon.mythic_level) {
              bestDungeon = dungeon;
            } else if (dungeon.mythic_level === bestDungeon.mythic_level) {
              if (dungeon.clear_time_ms < bestDungeon.clear_time_ms) {
                bestDungeon = dungeon;
              }
            }
          }

          let dungeonKeyUpgrade = "";
          for (let i = 0; i < bestDungeon.num_keystone_upgrades; i++) {
            dungeonKeyUpgrade += "+";
          }

          const dungeonLevel = dungeonKeyUpgrade + bestDungeon.mythic_level;
          const dungeonName = bestDungeon.short_name;

          const dungeonTime = msToTime(bestDungeon.clear_time_ms);

          const armoryLink = `https://worldofwarcraft.com/en-us/character/${characterRealmSafe}/${characterName}`;
          const wowProgressLink = `https://www.wowprogress.com/character/us/${characterRealmSafe}/${characterName}`;
          const raiderIOLink = `https://raider.io/characters/us/${characterRealmSafe}/${characterName}`;
          const warcraftLogsLink = `https://www.warcraftlogs.com/character/us/${characterRealmSafe}/${characterName}`;

          const payload = {
            content: "A player is looking for a guild!",
            username: "Recruitment Bot",
            embeds: [
              {
                author: {
                  name: `${characterName} - ${characterRealm} (US) | ${characterRace} ${characterSpec} ${characterClass} | ${characterILvl} ilvl`,
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
                    value: characterInfo ? characterInfo : "No bio posted..."
                  },
                  {
                    name: "__External Sites__",
                    value: `[Armory](${armoryLink}) | [RaiderIO](${raiderIOLink}) | [WoWProgress](${wowProgressLink}) | [WarcraftLogs](${warcraftLogsLink})`
                  },
                  {
                    name: "__Original Posting__",
                    value: characterUrl
                  }
                ]
              }
            ]
          };

          axios
            .post(webhook, payload)
            .then(function(response) {
              console.log("Webhook sent.");
            })
            .catch(function(error) {
              console.log("Error sending webhook", error);
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
