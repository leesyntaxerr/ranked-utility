const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const StatsManager = require('../utils/stats-manager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-stats')
        .setDescription('Ticket related subcommands')
        .addSubcommandGroup(group =>
            group.setName('user')
                .setDescription('User specific commands')
                .addSubcommand(sc =>
                    sc.setName('stats')
                        .setDescription('Show ticket stats for a staff member')
                        .addUserOption(opt =>
                            opt.setName('member')
                                .setDescription('Staff member')
                                .setRequired(true)
                        )
                )
        ),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup();
        if (group === 'user' && sub === 'stats') {
            const member = interaction.options.getUser('member');
            const { claimed, avgResponseMs, avgRating } = StatsManager.getStats(member.id);
            const avgRespMin = (avgResponseMs / 60000).toFixed(2);
            const embed = new EmbedBuilder()
                .setColor('Blue')
                .setTitle(`${member.tag} – Ticket Stats`)
                .addFields(
                    { name: 'Tickets Claimed', value: claimed.toString(), inline: true },
                    { name: 'Avg Response Time', value: `${avgRespMin} min`, inline: true },
                    { name: 'Avg Rating', value: avgRating ? avgRating.toFixed(2) : 'N/A', inline: true }
                )
                .setThumbnail(member.displayAvatarURL())
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }
    }
};
