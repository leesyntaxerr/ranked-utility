const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Send Season #1 ruleset embed')
        // Allow staff to post. Remove permission restriction if you want everyone able.
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🏆 Season #1 Ruleset')
            .setColor('Gold')
            .addFields(
                {
                    name: 'Always Allowed',
                    value: ` :white_check_mark: Ladder\n :white_check_mark: Fireballs\n :white_check_mark: Diamond Armor (2 per team)\n :white_check_mark: Blue side\n :white_check_mark: Water at own base\n :white_check_mark: Fireballing Diamonds`,
                },
                {
                    name: 'Allowed After Diamond II',
                    value: ` :warning: Invisibility\n :warning: Jump Boost`,
                },
                {
                    name: 'Allowed After Bed Break',
                    value: ` :warning: Both Sides\n :warning: Pearls\n :warning: Bridge egg`,
                },
                {
                    name: 'Not Allowed',
                    value: ` :negative_squared_cross_mark: Knockback Stick\n :negative_squared_cross_mark: Bow\n :negative_squared_cross_mark: Pop Up Towers\n :negative_squared_cross_mark: Silverfish\n :negative_squared_cross_mark: Golem`,
                },
            )
            .setFooter({ text: 'Please adhere to the rules to avoid penalties.' });

        await interaction.reply({ embeds: [embed] });
    },
};
