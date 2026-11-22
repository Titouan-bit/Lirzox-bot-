
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder
} = require("discord.js");

const Database = require("better-sqlite3");

// =====================================
// CONFIGURATION
// =====================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const CONFIG = {
  color: 0x5865F2,
  welcomeChannel: "", // ID du salon bienvenue
  logsChannel: "", // ID du salon logs
  ticketCategory: "", // ID de la catégorie tickets
  supportRole: "", // ID du rôle support (facultatif)
  currency: "Lirzox Coins"
};

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error("Configure DISCORD_TOKEN, CLIENT_ID et GUILD_ID dans .env");
}

// =====================================
// CLIENT DISCORD
// =====================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =====================================
// BASE DE DONNÉES
// =====================================

const db = new Database("lirzox.sqlite");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  money INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  last_daily INTEGER DEFAULT 0,
  UNIQUE(user_id, guild_id)
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  date INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  item TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  PRIMARY KEY(user_id, guild_id, item)
);
`);

const getUser = db.prepare(`
INSERT OR IGNORE INTO users (user_id, guild_id)
VALUES (?, ?)
`);

const getAccount = db.prepare(`
SELECT * FROM users WHERE user_id = ? AND guild_id = ?
`);

function account(userId, guildId) {
  getUser.run(userId, guildId);
  return getAccount.get(userId, guildId);
}

function addMoney(userId, guildId, amount) {
  account(userId, guildId);
  db.prepare(`
    UPDATE users SET money = money + ?
    WHERE user_id = ? AND guild_id = ?
  `).run(amount, userId, guildId);
}

function embed(title, description, color = CONFIG.color) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

// =====================================
// LOGS
// =====================================

async function sendLog(guild, title, description) {
  if (!CONFIG.logsChannel) return;

  const channel = guild.channels.cache.get(CONFIG.logsChannel);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    embeds: [embed(title, description)]
  }).catch(() => {});
}

// =====================================
// COMMANDES SLASH
// =====================================

const commands = [

  // MODÉRATION

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre")
    .addUserOption(o =>
      o.setName("membre").setDescription("Membre à bannir").setRequired(true))
    .addStringOption(o =>
      o.setName("raison").setDescription("Raison du bannissement"))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulser un membre")
    .addUserOption(o =>
      o.setName("membre").setDescription("Membre à expulser").setRequired(true))
    .addStringOption(o =>
      o.setName("raison").setDescription("Raison"))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Exclure temporairement un membre des conversations")
    .addUserOption(o =>
      o.setName("membre").setDescription("Membre").setRequired(true))
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("Durée en minutes")
        .setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption(o =>
      o.setName("raison").setDescription("Raison"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Avertir un membre")
    .addUserOption(o =>
      o.setName("membre").setDescription("Membre").setRequired(true))
    .addStringOption(o =>
      o.setName("raison").setDescription("Raison").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Consulter les avertissements")
    .addUserOption(o =>
      o.setName("membre").setDescription("Membre").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprimer des messages")
    .addIntegerOption(o =>
      o.setName("nombre").setDescription("Nombre de messages")
        .setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ECONOMIE

  new SlashCommandBuilder()
    .setName("solde")
    .setDescription("Voir son argent")
    .addUserOption(o =>
      o.setName("membre").setDescription("Membre à consulter")),

  new SlashCommandBuilder()
    .setName("journalier")
    .setDescription("Récupérer sa récompense quotidienne"),

  new SlashCommandBuilder()
    .setName("payer")
    .setDescription("Envoyer de l'argent à un membre")
    .addUserOption(o =>
      o.setName("membre").setDescription("Destinataire").setRequired(true))
    .addIntegerOption(o =>
      o.setName("montant").setDescription("Montant")
        .setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("boutique")
    .setDescription("Voir la boutique"),

  new SlashCommandBuilder()
    .setName("acheter")
    .setDescription("Acheter un article")
    .addStringOption(o =>
      o.setName("article").setDescription("Article")
        .setRequired(true)
        .addChoices(
          { name: "VIP", value: "VIP" },
          { name: "Premium", value: "Premium" },
          { name: "Booster", value: "Booster" }
        )),

  new SlashCommandBuilder()
    .setName("inventaire")
    .setDescription("Voir son inventaire"),

  // TICKETS

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Créer un ticket de support"),

  new SlashCommandBuilder()
    .setName("fermer")
    .setDescription("Fermer le ticket actuel"),

  // NIVEAUX

  new SlashCommandBuilder()
    .setName("niveau")
    .setDescription("Voir son niveau")
    .addUserOption(o =>
      o.setName("membre").setDescription("Membre à consulter")),

  new SlashCommandBuilder()
    .setName("classement")
    .setDescription("Voir le classement des niveaux")

].map(command => command.toJSON());

// =====================================
// ENREGISTREMENT DES COMMANDES
// =====================================

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("Commandes slash enregistrées !");
}

// =====================================
// DÉMARRAGE
// =====================================

client.once("ready", async () => {
  console.log(`Lirzox Bot connecté : ${client.user.tag}`);
  client.user.setActivity("Lirzox Family's");
});

// =====================================
// BIENVENUE
// =====================================

client.on("guildMemberAdd", async member => {
  if (CONFIG.welcomeChannel) {
    const channel = member.guild.channels.cache.get(
      CONFIG.welcomeChannel
    );

    if (channel && channel.isTextBased()) {
      await channel.send({
        embeds: [
          embed(
            "👋 Bienvenue !",
            `Bienvenue ${member} sur **${member.guild.name}** !\n\nNous sommes maintenant ${member.guild.memberCount} membres !`
          )
        ]
      }).catch(() => {});
    }
  }

  await sendLog(
    member.guild,
    "📥 Nouveau membre",
    `${member.user.tag} a rejoint le serveur.`
  );
});

// =====================================
// DÉPART
// =====================================

client.on("guildMemberRemove", async member => {
  await sendLog(
    member.guild,
    "📤 Départ",
    `${member.user.tag} a quitté le serveur.`
  );
});

// =====================================
// NIVEAUX ET XP
// =====================================

const cooldowns = new Map();

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();

  if (cooldowns.has(key) && now - cooldowns.get(key) < 60000) {
    return;
  }

  cooldowns.set(key, now);

  account(message.author.id, message.guild.id);

  const xp = Math.floor(Math.random() * 11) + 15;

  db.prepare(`
    UPDATE users SET xp = xp + ?
    WHERE user_id = ? AND guild_id = ?
  `).run(xp, message.author.id, message.guild.id);

  const user = account(message.author.id, message.guild.id);
  const level = Math.floor(Math.sqrt(user.xp / 100));

  const previousXP = user.xp - xp;
  const previousLevel = Math.floor(Math.sqrt(previousXP / 100));

  if (level > previousLevel) {
    message.channel.send({
      embeds: [
        embed(
          "⭐ Nouveau niveau !",
          `${message.author} vient de passer au niveau **${level}** !`
        )
      ]
    }).catch(() => {});
  }
});

// =====================================
// LOGS DE SUPPRESSION
// =====================================

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    "🗑️ Message supprimé",
    `Auteur : ${message.author?.tag || "Inconnu"}\nSalon : ${message.channel}\nContenu : ${(message.content || "Non disponible").slice(0, 1000)}`
  );
});

// =====================================
// INTERACTIONS
// =====================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, user } = interaction;

  try {

    // -----------------------------
    // BAN
    // -----------------------------

    if (commandName === "ban") {
      const target = interaction.options.getUser("membre");
      const reason = interaction.options.getString("raison") || "Aucune raison";

      const member = await guild.members.fetch(target.id);

      if (!member.bannable) {
        return interaction.reply({
          content: "❌ Impossible de bannir ce membre. Vérifie la hiérarchie des rôles et mes permissions.",
          ephemeral: true
        });
      }

      await member.ban({ reason });

      await sendLog(guild, "🔨 Bannissement", `${target.tag}\nModérateur : ${user.tag}\nRaison : ${reason}`);

      return interaction.reply(`🔨 **${target.tag}** a été banni.`);
    }

    // -----------------------------
    // KICK
    // -----------------------------

    if (commandName === "kick") {
      const target = interaction.options.getUser("membre");
      const reason = interaction.options.getString("raison") || "Aucune raison";

      const member = await guild.members.fetch(target.id);

      if (!member.kickable) {
        return interaction.reply({
          content: "❌ Impossible d'expulser ce membre.",
          ephemeral: true
        });
      }

      await member.kick(reason);

      await sendLog(guild, "👢 Expulsion", `${target.tag}\nRaison : ${reason}`);

      return interaction.reply(`👢 **${target.tag}** a été expulsé.`);
    }

    // -----------------------------
    // MUTE
    // -----------------------------

    if (commandName === "mute") {
      const target = interaction.options.getUser("membre");
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("raison") || "Aucune raison";

      const member = await guild.members.fetch(target.id);

      if (!member.moderatable) {
        return interaction.reply({
          content: "❌ Impossible d'appliquer ce timeout.",
          ephemeral: true
        });
      }

      await member.timeout(minutes * 60000, reason);

      await sendLog(guild, "🔇 Timeout", `${target.tag}\nDurée : ${minutes} minutes\nRaison : ${reason}`);

      return interaction.reply(`🔇 ${target.tag} a été mis en timeout pendant **${minutes} minutes**.`);
    }

    // -----------------------------
    // WARN
    // -----------------------------

    if (commandName === "warn") {
      const target = interaction.options.getUser("membre");
      const reason = interaction.options.getString("raison");

      db.prepare(`
        INSERT INTO warnings (guild_id, user_id, moderator_id, reason, date)
        VALUES (?, ?, ?, ?, ?)
      `).run(guild.id, target.id, user.id, reason, Date.now());

      await sendLog(guild, "⚠️ Avertissement", `${target.tag}\nModérateur : ${user.tag}\nRaison : ${reason}`);

      return interaction.reply(`⚠️ ${target.tag} a reçu un avertissement.`);
    }

    // -----------------------------
    // WARNINGS
    // -----------------------------

    if (commandName === "warnings") {
      const target = interaction.options.getUser("membre");

      const rows = db.prepare(`
        SELECT * FROM warnings
        WHERE guild_id = ? AND user_id = ?
        ORDER BY date DESC
      `).all(guild.id, target.id);

      const description = rows.length
        ? rows.map(w => `**#${w.id}** — ${w.reason} (par <@${w.moderator_id}>)`).join("\n")
        : "Aucun avertissement.";

      return interaction.reply({
        embeds: [embed(`⚠️ Avertissements de ${target.tag}`, description)],
        ephemeral: true
      });
    }

    // -----------------------------
    // CLEAR
    // -----------------------------

    if (commandName === "clear") {
      const amount = interaction.options.getInteger("nombre");

      const deleted = await interaction.channel.bulkDelete(amount, true);

      await sendLog(guild, "🧹 Nettoyage", `${deleted.size} messages supprimés dans ${interaction.channel}.`);

      return interaction.reply({
        content: `🧹 ${deleted.size} messages supprimés.`,
        ephemeral: true
      });
    }

    // -----------------------------
    // SOLDE
    // -----------------------------

    if (commandName === "solde") {
      const target = interaction.options.getUser("membre") || user;
      const data = account(target.id, guild.id);

      return interaction.reply({
        embeds: [
          embed("💰 Portefeuille", `**${target.username}** possède **${data.money} ${CONFIG.currency}**.`)
        ]
      });
    }

    // -----------------------------
    // JOURNALIER
    // -----------------------------

    if (commandName === "journalier") {
      const data = account(user.id, guild.id);
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      if (now - data.last_daily < day) {
        const remaining = Math.ceil((day - (now - data.last_daily)) / 3600000);

        return interaction.reply({
          content: `⏳ Tu as déjà récupéré ta récompense. Reviens dans environ ${remaining} heure(s).`,
          ephemeral: true
        });
      }

      const reward = 500;

      db.prepare(`
        UPDATE users SET money = money + ?, last_daily = ?
        WHERE user_id = ? AND guild_id = ?
      `).run(reward, now, user.id, guild.id);

      return interaction.reply(`🎁 Tu as reçu **${reward} ${CONFIG.currency}** !`);
    }

    // -----------------------------
    // PAYER
    // -----------------------------

    if (commandName === "payer") {
      const target = interaction.options.getUser("membre");
      const amount = interaction.options.getInteger("montant");

      if (target.bot || target.id === user.id) {
        return interaction.reply({
          content: "❌ Tu ne peux pas payer ce membre.",
          ephemeral: true
        });
      }

      const sender = account(user.id, guild.id);

      if (sender.money < amount) {
        return interaction.reply({
          content: "❌ Tu n'as pas assez d'argent.",
          ephemeral: true
        });
      }

      const transaction = db.transaction(() => {
        addMoney(user.id, guild.id, -amount);
        addMoney(target.id, guild.id, amount);
      });

      transaction();

      return interaction.reply(`💸 Tu as envoyé **${amount} ${CONFIG.currency}** à ${target}.`);
    }

    // -----------------------------
    // BOUTIQUE
    // -----------------------------

    if (commandName === "boutique") {
      return interaction.reply({
        embeds: [
          embed(
            "🛒 Boutique Lirzox",
            "**VIP** — 5 000 coins\n**Premium** — 10 000 coins\n**Booster** — 2 000 coins\n\nUtilise `/acheter` pour acheter un article."
          )
        ]
      });
    }

    // -----------------------------
    // ACHETER
    // -----------------------------

    if (commandName === "acheter") {
      const item = interaction.options.getString("article");

      const prices = {
        VIP: 5000,
        Premium: 10000,
        Booster: 2000
      };

      const price = prices[item];
      const data = account(user.id, guild.id);

      if (data.money < price) {
        return interaction.reply({
          content: "❌ Tu n'as pas assez de coins.",
          ephemeral: true
        });
      }

      const transaction = db.transaction(() => {
        addMoney(user.id, guild.id, -price);

        db.prepare(`
          INSERT INTO inventory (user_id, guild_id, item, quantity)
          VALUES (?, ?, ?, 1)
          ON CONFLICT(user_id, guild_id, item)
          DO UPDATE SET quantity = quantity + 1
        `).run(user.id, guild.id, item);
      });

      transaction();

      return interaction.reply(`🛍️ Tu as acheté **${item}** pour ${price} coins !\nL'article est dans ton inventaire.`);
    }

    // -----------------------------
    // INVENTAIRE
    // -----------------------------

    if (commandName === "inventaire") {
      const items = db.prepare(`
        SELECT item, quantity FROM inventory
        WHERE user_id = ? AND guild_id = ?
      `).all(user.id, guild.id);

      const description = items.length
        ? items.map(i => `🎁 **${i.item}** × ${i.quantity}`).join("\n")
        : "Ton inventaire est vide.";

      return interaction.reply({
        embeds: [embed("🎒 Inventaire", description)]
      });
    }

    // -----------------------------
    // TICKET
    // -----------------------------

    if (commandName === "ticket") {
      const existing = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText &&
        c.topic === `ticket-owner:${user.id}`
      );

      if (existing) {
        return interaction.reply({
          content: `❌ Tu as déjà un ticket : ${existing}`,
          ephemeral: true
        });
      }

      const permissions = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ];

      if (CONFIG.supportRole) {
        permissions.push({
          id: CONFIG.supportRole,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }

      const channel = await guild.channels.create({
        name: `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90),
        type: ChannelType.GuildText,
        topic: `ticket-owner:${user.id}`,
        parent: CONFIG.ticketCategory || undefined,
        permissionOverwrites: permissions
      });

      await channel.send({
        content: `${user} <@&${CONFIG.supportRole || guild.id}>`,
        embeds: [
          embed(
            "🎫 Support Lirzox",
            "Bienvenue dans ton ticket !\nExplique ton problème au staff.\n\nPour fermer le ticket, utilise `/fermer`."
          )
        ]
      });

      return interaction.reply({
        content: `✅ Ton ticket a été créé : ${channel}`,
        ephemeral: true
      });
    }

    // -----------------------------
    // FERMER TICKET
    // -----------------------------

    if (commandName === "fermer") {
      if (!interaction.channel.topic?.startsWith("ticket-owner:")) {
        return interaction.reply({
          content: "❌ Cette commande fonctionne uniquement dans un ticket.",
          ephemeral: true
        });
      }

      const ownerId = interaction.channel.topic.split(":")[1];

      const isOwner = ownerId === user.id;
      const isStaff = interaction.memberPermissions.has(
        PermissionFlagsBits.ManageChannels
      );

      if (!isOwner && !isStaff) {
        return interaction.reply({
          content: "❌ Tu ne peux pas fermer ce ticket.",
          ephemeral: true
        });
      }

      await interaction.deferReply();

      await interaction.channel.permissionOverwrites.edit(
        ownerId,
        {
          SendMessages: false
        }
      ).catch(() => {});

      await interaction.channel.setName(
        `ferme-${interaction.channel.name}`.slice(0, 100)
      );

      await interaction.editReply("🔒 Ticket fermé. Le staff peut toujours consulter son contenu.");

      await sendLog(guild, "🎫 Ticket fermé", `Ticket : ${interaction.channel.name}\nPar : ${user.tag}`);

      return;
    }

    // -----------------------------
    // NIVEAU
    // -----------------------------

    if (commandName === "niveau") {
      const target = interaction.options.getUser("membre") || user;
      const data = account(target.id, guild.id);

      const level = Math.floor(Math.sqrt(data.xp / 100));
      const nextXP = (level + 1) ** 2 * 100;

      return interaction.reply({
        embeds: [
          embed(
            "⭐ Niveau",
            `Membre : ${target}\nNiveau : **${level}**\nXP : **${data.xp} / ${nextXP}**`
          )
        ]
      });
    }

    // -----------------------------
    // CLASSEMENT
    // -----------------------------

    if (commandName === "classement") {
      const rows = db.prepare(`
        SELECT user_id, xp FROM users
        WHERE guild_id = ?
        ORDER BY xp DESC LIMIT 10
      `).all(guild.id);

      const description = rows.length
        ? rows.map((r, i) =>
          `**${i + 1}.** <@${r.user_id}> — Niveau ${Math.floor(Math.sqrt(r.xp / 100))} (${r.xp} XP)`
        ).join("\n")
        : "Aucun classement pour le moment.";

      return interaction.reply({
        embeds: [embed("🏆 Classement Lirzox", description)]
      });
    }

  } catch (error) {
    console.error("Erreur commande :", error);

    const response = {
      content: "❌ Une erreur est survenue. Vérifie les permissions du bot et réessaie.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// =====================================
// CONNEXION ET ENREGISTREMENT
// =====================================

async function startBot() {
  await registerCommands();
  await client.login(TOKEN);
}

startBot().catch(console.error);
