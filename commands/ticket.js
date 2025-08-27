const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const TicketSystem = require('../utils/ticket-system');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Manage tickets and ticket settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the ticket system in this channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to this ticket')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('The user to add to the ticket')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from this ticket')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove from the ticket')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Close the current ticket')
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for closing the ticket')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('claim')
                .setDescription('Claim this ticket')
        ),

    async execute(interaction) {
        const { options, channel, guild, member } = interaction;
        const ticketSystem = interaction.client.ticketSystem;
        const subcommand = options.getSubcommand();

        // Handle setup command
        if (subcommand === 'setup') {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: '❌ You need administrator permissions to set up the ticket system.',
                    ephemeral: true
                });
            }

            await ticketSystem.createTicketPanel(channel);
            return interaction.reply({
                content: '✅ Ticket panel has been set up in this channel!',
                ephemeral: true
            });
        }

        // Ensure this is a ticket channel for other commands
        if (!channel.name.startsWith('ticket-')) {
            return interaction.reply({
                content: '❌ This command can only be used in a ticket channel.',
                ephemeral: true
            });
        }

        // Handle ticket commands
        switch (subcommand) {
            case 'add': {
                const user = options.getUser('user');
                await channel.permissionOverwrites.edit(user.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });

                const embed = new EmbedBuilder()
                    .setDescription(`✅ ${user} has been added to this ticket by ${interaction.user}`)
                    .setColor('#57F287');

                return interaction.reply({ embeds: [embed] });
            }

            case 'remove': {
                const user = options.getUser('user');
                
                // Don't allow removing the ticket creator
                const ticketData = ticketSystem.activeTickets.get(channel.id);
                if (ticketData && ticketData.userId === user.id) {
                    return interaction.reply({
                        content: "❌ You can't remove the ticket creator from their own ticket.",
                        ephemeral: true
                    });
                }

                await channel.permissionOverwrites.edit(user.id, {
                    ViewChannel: false,
                    SendMessages: false
                });

                const embed = new EmbedBuilder()
                    .setDescription(`❌ ${user} has been removed from this ticket by ${interaction.user}`)
                    .setColor('#ED4245');

                return interaction.reply({ embeds: [embed] });
            }

            case 'close': {
                const reason = options.getString('reason') || 'No reason provided';
                return ticketSystem.closeTicket(interaction, reason);
            }

            case 'claim': {
                const ticketData = ticketSystem.activeTickets.get(channel.id);
                if (!ticketData) {
                    return interaction.reply({
                        content: '❌ This is not a valid ticket channel.',
                        ephemeral: true
                    });
                }

                if (ticketData.claimedBy) {
                    return interaction.reply({
                        content: `❌ This ticket is already claimed by <@${ticketData.claimedBy}>.`,
                        ephemeral: true
                    });
                }

                ticketData.claimedBy = interaction.user.id;
                ticketData.status = 'claimed';
                ticketSystem.saveTickets();

                const embed = new EmbedBuilder()
                    .setDescription(`✅ ${interaction.user} has claimed this ticket`)
                    .setColor('#FEE75C');

                return interaction.reply({ embeds: [embed] });
            }

            default:
                return interaction.reply({
                    content: '❌ Unknown subcommand.',
                    ephemeral: true
                });
        }
    },
};
