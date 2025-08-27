const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

// Map of label -> { id, description, emoji }
const roles = {
    Events:        { id: '1379470600103268396', description: 'Get notified about events',       emoji: '📅' },
    Giveaways:     { id: '1379470638926008440', description: 'Ping for giveaways',             emoji: '🎉' },
    Affiliates:    { id: '1387881386295296060', description: 'Affiliate partner updates',     emoji: '🤝' },
    Updates:       { id: '1379472855976120453', description: 'Bot / server updates',          emoji: '🛠️' },
    'Queue Ping':  { id: '1387881468386087074', description: 'Be pinged when queue is ready', emoji: '🔔' },
    Announcements: { id: '1379507264959938590', description: 'Major announcements',           emoji: '📢' },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionroles')
        .setDescription('Send the notification role selector embed')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Build embed
        const embed = new EmbedBuilder()
            .setTitle('📌 Self-Assign Your Notification Roles')
            .setDescription('Select the roles you want to receive pings for. You can select multiple or deselect to remove.')
            .setColor('Blurple');

        // Select menu options
        const options = Object.entries(roles).map(([label, { id, description, emoji }]) => ({
            label,
            value: id,
            description,
            emoji,
        }));

        const menu = new StringSelectMenuBuilder()
            .setCustomId('rr-select')
            .setPlaceholder('Select your notification roles')
            .setMinValues(0)
            .setMaxValues(options.length)
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({ embeds: [embed], components: [row] });
    },
};
