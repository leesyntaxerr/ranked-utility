const {
    SlashCommandBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    PermissionFlagsBits,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-panel')
        .setDescription('Sends the ticket creation panel to the current channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only admins can use this
    async execute(interaction) {
        const panelEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Support')
            .setDescription('Please select a category from the menu below to open a support ticket.');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket-create')
            .setPlaceholder('Choose a reason...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('General inquiries and questions')
                    .setValue('general')
                    .setEmoji('❓'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Scoring')
                    .setDescription('Score-related inquiries')
                    .setValue('scoring')
                    .setEmoji('📊'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Registration')
                    .setDescription('Account registration issues')
                    .setValue('registration')
                    .setEmoji('📝'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Appeals')
                    .setDescription('Ban or mute appeals')
                    .setValue('appeals')
                    .setEmoji('⚖️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Store')
                    .setDescription('Store-related inquiries')
                    .setValue('store')
                    .setEmoji('🛍️')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.channel.send({
            embeds: [panelEmbed],
            components: [row],
        });

        await interaction.reply({ content: 'Ticket panel has been sent.', ephemeral: true });
    },
};
