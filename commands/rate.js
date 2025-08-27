const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const statsManager = require('../utils/stats-manager');

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Rate a support staff member (usable only in ticket channels).')
        .addSubcommand(sub =>
            sub.setName('staff')
               .setDescription('Rate a staff member for their support.')
               .addUserOption(opt => opt.setName('user').setDescription('Staff member to rate').setRequired(true))
        ),

    async execute(interaction) {
        // Check cooldown
        const now = Date.now();
        const cooldowns = interaction.client.cooldowns || new Map();
        const cooldownEnd = cooldowns.get(interaction.user.id) || 0;
        
        if (now < cooldownEnd) {
            const timeLeft = Math.ceil((cooldownEnd - now) / (1000 * 60 * 60));
            return interaction.reply({ 
                content: `⏳ You can rate again in ${timeLeft} hours.`, 
                ephemeral: true 
            });
        }

        const ticketSystem = interaction.client.ticketSystem;
        if (!ticketSystem || !ticketSystem.activeTickets?.has(interaction.channel.id)) {
            return interaction.reply({ content: '❌ This command can only be used within a ticket channel.', ephemeral: true });
        }

        const staffUser = interaction.options.getUser('user');
        if (!staffUser) {
            return interaction.reply({ content: 'Please specify a valid user to rate.', ephemeral: true });
        }

        // Build rating embed
        const embed = new EmbedBuilder()
            .setColor('Blue')
            .setTitle(`Rate Support Experience`)
            .setDescription(`How would you rate the support provided by ${staffUser} ?`);

        const row = new ActionRowBuilder();
        for (let i = 1; i <= 5; i++) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`rate-${staffUser.id}-${i}`)
                    .setLabel(String(i))
                    .setStyle(ButtonStyle.Primary)
            );
        }

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};
