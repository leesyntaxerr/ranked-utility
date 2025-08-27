const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Creates a paginated embed for member lists
 * @param {Object} options - Options for the paginated list
 * @param {Array} options.members - Array of members to display
 * @param {string} options.roleName - Name of the role
 * @param {string} options.emoji - Emoji to display with the role
 * @param {number} options.color - Color for the embed
 * @param {number} [itemsPerPage=10] - Number of items per page
 * @returns {Object} Object containing embeds and components for pagination
 */
function createPaginatedMemberList({ members, roleName, emoji, color, itemsPerPage = 10 }) {
    const totalPages = Math.ceil(members.length / itemsPerPage);
    const embeds = [];
    
    for (let i = 0; i < totalPages; i++) {
        const start = i * itemsPerPage;
        const end = start + itemsPerPage;
        const pageMembers = members.slice(start, end);
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${emoji} ${roleName} Members (${members.length} total)`)
            .setDescription(pageMembers.map((m, idx) => 
                `**${start + idx + 1}.** ${m.user.tag} (${m.toString()})`
            ).join('\n'))
            .setFooter({ 
                text: `Page ${i + 1} of ${totalPages} • ${new Date().toLocaleDateString()}` 
            });
            
        embeds.push(embed);
    }
    
    // Only add buttons if there's more than one page
    const components = [];
    if (totalPages > 1) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(totalPages <= 1)
            );
        components.push(row);
    }
    
    return { embeds, components };
}

module.exports = { createPaginatedMemberList };
