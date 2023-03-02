# lfr

Core Back End services for lookingforraid.io web service.
<br />
<br />
Customizable recruitment alerter that notifies World of Warcraft guilds whenever a player is looking for a new guild.
<br />
<br />
It scrapes the web to find new players, and then uses OAuth2 to send a message to the given Discord channel, based on certain business logic. Each message contains relevant stats and info about each player, sourced from different public and private APIs.
<br />
<br />
The application is hosted in AWS and uses DynamoDB to store data about guilds and players.

![alert-example](https://user-images.githubusercontent.com/37252545/222576292-f165c321-20ef-49c1-a7b8-72169e1ea42d.png)

https://user-images.githubusercontent.com/37252545/222576308-65c5f663-7d0b-4529-ad2a-bd5cea8fd27f.mp4

