const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// PPP vote configuration
const PPP_CONFIG = {
    voteDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
    forceStopRoles: [
        '1379518462790996108', // PUGS manager
        '1379518503182405682', // PUGS manager
        '1379518550791688274', // Premium manager
        '1379518279378276413'  // PUP manager
    ]
};

class PPPVoteSystem {
    constructor(client) {
        this.client = client;
        this.activeVotes = new Map(); // channelID -> voteData
        this.setupVoteExpiry();
    }

    // Start a new PPP vote
    async startVote(channel, title) {
        // Check if there's already an active vote in this channel
        if (this.activeVotes.has(channel.id)) {
            return channel.send('❌ There is already an active vote in this channel.');
        }

        // Create vote embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor('#5865F2')
            .setDescription('React with 👍 to vote YES or 👎 to vote NO')
            .setFooter({ text: 'Vote will expire in 7 days' });

        // Create vote message
        const message = await channel.send({
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ppp-vote-yes')
                        .setLabel('Yes')
                        .setEmoji('👍')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ppp-vote-no')
                        .setLabel('No')
                        .setEmoji('👎')
                        .setStyle(ButtonStyle.Danger)
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ppp-vote-null-0-force-stop')
                        .setLabel('Force Stop')
                        .setEmoji('🛑')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(false) // Always enabled
                )
            ]
        });

        // Store vote data
        this.activeVotes.set(channel.id, {
            messageId: message.id,
            startTime: Date.now(),
            votes: {
                yes: new Set(),
                no: new Set()
            },
            channel: channel // Store channel reference for force stop
        });

        return message;
    }

    // Handle vote button interactions
    async handleVote(interaction) {
        const channel = interaction.channel;
        const voteData = this.activeVotes.get(channel.id);

        if (!voteData) {
            return interaction.reply({ 
                content: '❌ This vote has expired or was stopped.',
                ephemeral: true
            });
        }

        const userId = interaction.user.id;
        const isYesVote = interaction.customId === 'ppp-vote-yes';

        // Remove user from opposite vote if they've already voted
        if (isYesVote) {
            voteData.votes.no.delete(userId);
            voteData.votes.yes.add(userId);
        } else {
            voteData.votes.yes.delete(userId);
            voteData.votes.no.add(userId);
        }

        // Update message with vote counts
        const yesCount = voteData.votes.yes.size;
        const noCount = voteData.votes.no.size;
        const totalVotes = yesCount + noCount;

        const embed = interaction.message.embeds[0];
        embed.setDescription(
            `React with 👍 to vote YES or 👎 to vote NO\n\n` +
            `**Votes:** ${yesCount} 👍 - ${noCount} 👎\n` +
            `**Total:** ${totalVotes} votes\n` +
            `Time remaining: ${this.getTimeRemaining(voteData.startTime)}
        `);

        await interaction.message.edit({ embeds: [embed] });
        await interaction.deferUpdate();
    }

    // Force stop a vote
    async forceStopVote(channel, user) {
        // Check if user has permission to force stop
        const hasPermission = user.roles.cache.some(role => 
            PPP_CONFIG.forceStopRoles.includes(role.id)
        );

        if (!hasPermission) {
            return channel.send('❌ You do not have permission to force stop this vote.');
        }

        const voteData = this.activeVotes.get(channel.id);
        if (!voteData) {
            return channel.send('❌ There is no active vote in this channel.');
        }

        // Get vote counts
        const yesCount = voteData.votes.yes.size;
        const noCount = voteData.votes.no.size;
        const totalVotes = yesCount + noCount;

        // Create result embed
        const embed = new EmbedBuilder()
            .setTitle('Vote Stopped')
            .setColor('#FF0000')
            .addFields(
                { name: 'Final Results', value: `${yesCount} 👍 - ${noCount} 👎` },
                { name: 'Total Votes', value: totalVotes.toString() },
                { name: 'Stopped By', value: user.toString() }
            );

        // Get original message and update it
        const message = await channel.messages.fetch(voteData.messageId);
        await message.edit({
            embeds: [embed],
            components: []
        });

        // Remove from active votes
        this.activeVotes.delete(channel.id);

        return message;
    }

    // Get time remaining for a vote
    getTimeRemaining(startTime) {
        const now = Date.now();
        const remaining = PPP_CONFIG.voteDuration - (now - startTime);
        const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        return `${days}d ${hours}h`;
    }

    // Setup vote expiry system
    setupVoteExpiry() {
        setInterval(() => {
            const now = Date.now();
            for (const [channelId, voteData] of this.activeVotes.entries()) {
                if (now - voteData.startTime >= PPP_CONFIG.voteDuration) {
                    this.handleVoteExpiry(channelId);
                }
            }
        }, 60000); // Check every minute
    }

    // Handle vote expiry
    async handleVoteExpiry(channelId) {
        const channel = await this.client.channels.fetch(channelId);
        const voteData = this.activeVotes.get(channelId);

        if (!channel || !voteData) return;

        try {
            // Get vote counts
            const yesCount = voteData.votes.yes.size;
            const noCount = voteData.votes.no.size;
            const totalVotes = yesCount + noCount;

            // Create result embed
            const embed = new EmbedBuilder()
                .setTitle('Vote Expired')
                .setColor('#FFA500')
                .addFields(
                    { name: 'Final Results', value: `${yesCount} 👍 - ${noCount} 👎` },
                    { name: 'Total Votes', value: totalVotes.toString() }
                );

            // Get original message and update it
            const message = await channel.messages.fetch(voteData.messageId);
            await message.edit({
                embeds: [embed],
                components: []
            });

            // Remove from active votes
            this.activeVotes.delete(channelId);
        } catch (error) {
            console.error('Error handling vote expiry:', error);
            this.activeVotes.delete(channelId);
        }
    }
}

module.exports = PPPVoteSystem;
