const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot speak in an embed.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('message')
                .setDescription('The message content. Use \\n for new lines')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('title')
                .setDescription('Optional embed title')
                .setRequired(false))
        .addStringOption(opt =>
            opt.setName('color')
                .setDescription('Hex color (e.g. #ff9900)')
                .setRequired(false)),

    async execute(interaction) {
                let content = interaction.options.getString('message');
        const title = interaction.options.getString('title');
        const colorInput = interaction.options.getString('color');

        // Replace literal \n with actual newlines for multi-line support
        content = content.replace(/\\n/g, '\n');

        const embed = new EmbedBuilder()
            .setColor(colorInput || '#00aaff')
            .setDescription(content)
            .setTimestamp();

        if (title) embed.setTitle(title);

        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Sent.', ephemeral: true });
    },
};
