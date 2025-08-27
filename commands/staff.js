const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const statsManager = require('../utils/stats-manager');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription('Staff management commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('lb')
                .setDescription('Show staff leaderboard')
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Get all users with stats
            const statsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/staff-stats.json'), 'utf8'));
            
            // Get stats for each user and filter out those with no ratings
            const userStats = [];
            
            // Process each user with stats
            for (const [userId, stats] of Object.entries(statsData)) {
                // Only process users with ratings
                if (stats.ratings?.count > 0) {
                    try {
                        const member = await interaction.guild.members.fetch(userId).catch(() => null);
                        if (member) {
                            // Calculate average rating from raw data
                            const avgRating = stats.ratings.count > 0 
                                ? (stats.ratings.total / stats.ratings.count).toFixed(2)
                                : 0;
                                
                            // Calculate response time if available
                            let responseTime = 'N/A';
                            if (stats.totalResponseMs && stats.claimed > 0) {
                                responseTime = (stats.totalResponseMs / stats.claimed / 1000).toFixed(2) + 's';
                            }
                            
                            userStats.push({
                                member,
                                avgRating: parseFloat(avgRating),
                                responseTime,
                                ratingsCount: stats.ratings.count,
                                ticketsClaimed: stats.claimed || 0
                            });
                        }
                    } catch (error) {
                        console.error(`Error processing user ${userId}:`, error);
                    }
                }
            }

            // Sort by average rating (descending) and slice top 10
            const topUsers = userStats
                .sort((a, b) => b.avgRating - a.avgRating || a.responseTime - b.responseTime)
                .slice(0, 10);

            if (topUsers.length === 0) {
                return interaction.editReply('No users have been rated yet.');
            }

            // Create leaderboard embed
            const embed = new EmbedBuilder()
                .setTitle('🏆 Support Leaderboard')
                .setColor('#5865F2')
                .setDescription('Top support members based on ratings and response time')
                .setTimestamp();

            // Add fields for each user
            topUsers.forEach((user, index) => {
                embed.addFields({
                    name: `#${index + 1} ${user.member.displayName}`,
                    value: `⭐ ${user.avgRating.toFixed(2)}/5 (${user.ratingsCount} rating${user.ratingsCount !== 1 ? 's' : ''})\n` +
                           `⏱️ ${user.responseTime} avg. response\n` +
                           `📋 ${user.ticketsClaimed} ticket${user.ticketsClaimed !== 1 ? 's' : ''} claimed`,
                    inline: false
                });
            });

            // Add footer with last updated time
            embed.setFooter({
                text: `Showing top ${topUsers.length} support members`,
                iconURL: interaction.guild.iconURL()
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error generating staff leaderboard:', error);
            await interaction.editReply('An error occurred while generating the leaderboard.');
        }
    }
};
