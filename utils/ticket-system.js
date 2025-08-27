const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder 
} = require('discord.js');
const { createTranscript } = require('discord-html-transcripts');
const fs = require('fs');
const path = require('path');

// Ticket configuration loaded from config.json
const { ticket: TICKET_CONFIG } = require('../config.json');
/* Legacy inline config removed - old config commented out

        {
            id: 'general',
            label: 'General',
            description: 'General inquiries and questions',
            emoji: '❓',
            staffRoles: ['1378827154782945382', '1378827463483723866']
        },
        {
            id: 'scoring',
            label: 'Scoring',
            description: 'Score-related inquiries',
            emoji: '📊',
            staffRoles: ['1378827154782945382', '1378827463483723866']
        },
        {
            id: 'registration',
            label: 'Registration',
            description: 'Account registration issues',
            emoji: '📝',
            staffRoles: ['1378827154782945382', '1378827463483723866']
        },
        {
            id: 'appeals',
            label: 'Appeals',
            description: 'Ban or mute appeals',
            emoji: '⚖️',
            staffRoles: ['1378827154782945382']
        },
        {
            id: 'store',
            label: 'Store',
            description: 'Store-related inquiries',
            emoji: '🛍️',
            staffRoles: ['1378827154782945382']
        }
    ],
    ticketCategoryId: '1387881688251633827',
    logChannel: 'ticket-logs',
    archiveCategory: 'ticket-archive',
    inactiveTimeout: 48 * 60 * 60 * 1000, // 48 hours
    maxTickets: 3
};
*/

class TicketSystem {
    constructor(client) {
        this.client = client;
        this.openTickets = new Map(); // userID -> ticketCount
        this.activeTickets = new Map(); // channelID -> {userId, category, claimedBy, status, lastActivity}
        this.loadTickets();
        this.setupInactivityCheck();
    }

    // Initialize ticket panel in a channel with dropdown menu
    async createTicketPanel(channel) {
        const panelEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Support')
            .setDescription('Please select a category from the menu below to open a support ticket.');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket-create')
            .setPlaceholder('Choose a reason...')
            .addOptions(
                TICKET_CONFIG.categories.map(category => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(category.label)
                        .setDescription(category.description)
                        .setValue(category.id)
                        .setEmoji(category.emoji)
                )
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await channel.send({
            embeds: [panelEmbed],
            components: [row],
        });
    }

    // Create a new ticket
    async createTicket(interaction, categoryId) {
        // Defer immediately to avoid interaction timeout
        if (!interaction.deferred && !interaction.replied) {
            try {
                await interaction.deferReply({ ephemeral: true });
            } catch (err) {
                console.warn('Failed to defer interaction:', err);
            }
        }
        const user = interaction.user;
        const guild = interaction.guild;
        const category = TICKET_CONFIG.categories.find(c => c.id === categoryId);
        
        if (!category) {
            return interaction.editReply({ content: 'Invalid ticket category.' });
        }

        // Check if user has reached max tickets
        const userTickets = this.getUserTickets(user.id);
        if (userTickets.length >= TICKET_CONFIG.maxTickets) {
            return interaction.editReply({
                content: `You can only have ${TICKET_CONFIG.maxTickets} open tickets at a time.`
            });
        }

        // Create ticket channel
        const ticketNumber = (await this.getNextTicketNumber()).toString().padStart(4, '0');
        const channelName = `ticket-${categoryId}-${ticketNumber}`;
        
        try {
            const channel = await guild.channels.create({
                name: channelName,
                type: 0, // Text channel
                parent: TICKET_CONFIG.ticketCategoryId,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ReadMessageHistory
                        ],
                    },
                    // Global roles that should have access to all tickets
                    ...TICKET_CONFIG.globalStaffRoles.map(roleId => ({
                        id: roleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ManageMessages
                        ],
                    })),
                    
                    // Category-specific roles
                    ...category.staffRoles.map(roleId => ({
                        id: roleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ManageMessages
                        ],
                    })),
                    // Additional roles for appeals tickets
                    ...(categoryId === 'appeals' ? [
                        {
                            id: '1379054069615956129',
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.ManageMessages
                            ],
                        },
                        {
                            id: '1380041309854896232',
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.ManageMessages
                            ],
                        }
                    ] : [])
                ],
                topic: `Ticket #${ticketNumber} | ${user.tag} (${user.id}) | ${category.label}`
            });

            // Store ticket data
            const ticketData = {
                userId: user.id,
                category: categoryId,
                claimedBy: null,
                status: 'open',
                createdAt: Date.now(),
                lastActivity: Date.now(),
                staffRoles: [...category.staffRoles] // Save a copy of staff roles from the category
            };
            this.activeTickets.set(channel.id, ticketData);
            this.saveTickets();

            // Send welcome message
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🎫 ${category.label}`)
                .setDescription(`Thank you for creating a ticket, ${user}!
                \n**Category:** ${category.emoji} ${category.label}
                \nPlease describe your issue in detail and our staff will assist you shortly.`)
                .setColor('#5865F2')
                .setFooter({ text: `Ticket #${ticketNumber}` });

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket-close')
                    .setLabel('Close Ticket')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('ticket-claim')
                    .setLabel('Claim')
                    .setEmoji('🙋')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ 
                content: `${user} ${category.staffRoles.map(r => `<@&${r}>`).join(' ')}`,
                embeds: [welcomeEmbed],
                components: [actionRow]
            });

            // Log ticket creation
            await this.logTicketAction(channel, 'created', user);
            
            return interaction.editReply({ content: `Your ticket has been created: <#${channel.id}>`, ephemeral: true });
        } catch (error) {
            console.error('Error creating ticket:', error);
            return interaction.reply({
                content: 'An error occurred while creating your ticket.',
                ephemeral: true
            });
        }
    }

    // Handle ticket close
    async closeTicket(interaction, reason = 'No reason provided') {
        const channel = interaction.channel;
        const ticketData = this.activeTickets.get(channel.id);
        
        // Helper function to safely reply to the interaction
        const safeReply = async (content, ephemeral = true) => {
            try {
                if (interaction.replied) {
                    return await interaction.followUp({ content, ephemeral });
                } else if (interaction.deferred) {
                    return await interaction.editReply({ content, ephemeral });
                } else {
                    return await interaction.reply({ content, ephemeral, fetchReply: true });
                }
            } catch (error) {
                console.error('Error in safeReply:', error);
                return null;
            }
        };
        
        // Early exit if channel is invalid
        if (!ticketData) {
            return safeReply('❌ This is not a valid ticket channel.');
        }

        // Check permissions
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const isTicketOwner = interaction.user.id === ticketData.userId;
        
        // Check if user has any staff role (including global and appeal-specific roles)
        const hasStaffRole = interaction.member.roles.cache.some(role => {
            // Check category-specific staff roles
            if (Array.isArray(ticketData.staffRoles) && 
                ticketData.staffRoles.includes(role.id)) {
                return true;
            }
            
            // Check global staff roles
            const globalStaffRoles = TICKET_CONFIG.globalStaffRoles;
            
            if (globalStaffRoles.includes(role.id)) {
                return true;
            }
            
            // Check appeal-specific roles if this is an appeals ticket
            if (ticketData.category === 'appeals') {
                const appealRoles = [
                    '1379054069615956129',
                    '1380041309854896232'
                ];
                if (appealRoles.includes(role.id)) {
                    return true;
                }
            }
            
            return false;
        });
        
        if (!isAdmin && !hasStaffRole && !isTicketOwner) {
            return safeReply('❌ You do not have permission to close this ticket.');
        }

        // Acknowledge the interaction immediately to prevent timeout
        await safeReply('🔄 Closing ticket, please wait...');

        try {
            // Disable all buttons in the ticket
            const messages = await channel.messages.fetch();
            for (const message of messages.values()) {
                // Only attempt to edit messages authored by the bot to avoid DiscordAPIError[50005]
                if (message.author?.id !== this.client.user.id) continue;

                if (message.components && message.components.length > 0) {
                    const disabledComponents = message.components.map(row => {
                        return new ActionRowBuilder().addComponents(
                            row.components.map(component => {
                                const newComponent = ButtonBuilder.from(component);
                                return newComponent.setDisabled(true);
                            })
                        );
                    });
                    try {
                        await message.edit({ components: disabledComponents });
                    } catch (error) {
                        // Ignore edit errors on unexpected cases
                        console.warn(`Failed to disable components on message ${message.id}:`, error);
                    }
                }
            }

            // Create transcript
            let transcript;
            try {
                transcript = await this.createTranscript(channel);
                
                // Send transcript to log channel
                await this.logTicketAction(channel, 'closed', interaction.user, reason, transcript);
                
                // Send transcript to user
                try {
                    const user = await this.client.users.fetch(ticketData.userId);
                    await user.send({
                        content: `Your ticket in ${interaction.guild.name} has been closed.\n**Reason:** ${reason}\n\n**Transcript:**`,
                        files: [transcript]
                    });
                } catch (error) {
                    console.error('Failed to send transcript to user:', error);
                }
            } catch (error) {
                console.error('Error creating transcript:', error);
                await safeReply('❌ An error occurred while creating the transcript. The ticket will still be closed.');
            }

            // Send closing message
            const closeEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setDescription(`🔒 **Ticket Closed**\n**Closed by:** ${interaction.user}\n**Reason:** ${reason}`);

            await channel.send({ embeds: [closeEmbed] });

            // Update ticket status and save
            this.activeTickets.delete(channel.id);
            this.saveTickets();

            // Send final message
            await safeReply('✅ Ticket is being closed. This channel will be deleted in 5 seconds.');

            // Delete the channel after a short delay
            setTimeout(async () => {
                try {
                    await channel.delete('Ticket closed');
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                    // If we can't delete the channel, at least remove it from active tickets
                    this.activeTickets.delete(channel.id);
                    this.saveTickets();
                }
            }, 5000);

        } catch (error) {
            console.error('Error in closeTicket:', error);
            await safeReply('❌ An error occurred while closing the ticket. Please try again.');
        }
    }

    // Create transcript of ticket
    async createTranscript(channel) {
        const attachment = await createTranscript(channel, {
            limit: -1,
            returnBuffer: false,
            fileName: `transcript-${channel.name}.html`
        });
        return attachment;
    }

    // Log ticket actions
    async logTicketAction(channel, action, user, reason = '', transcript = null) {
        const ticketData = this.activeTickets.get(channel.id);
        if (!ticketData) return;

        const logChannel = channel.guild.channels.cache.find(
            c => c.name === TICKET_CONFIG.logChannel && c.type === 0
        );

        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(`Ticket ${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setColor(action === 'created' ? '#57F287' : action === 'closed' ? '#ED4245' : '#FEE75C')
            .addFields(
                { name: 'Ticket', value: channel.toString(), inline: true },
                { name: 'User', value: `<@${ticketData.userId}>`, inline: true },
                { name: 'Category', value: ticketData.category, inline: true },
                { name: 'Action By', value: user.toString(), inline: true },
                { name: 'Status', value: ticketData.status, inline: true },
                { name: 'Reason', value: reason || 'No reason provided' }
            )
            .setTimestamp();

        const logMessage = await logChannel.send({ 
            embeds: [embed],
            files: transcript ? [transcript] : []
        });

        return logMessage;
    }

    // Get user's open tickets
    getUserTickets(userId) {
        return Array.from(this.activeTickets.entries())
            .filter(([_, data]) => data.userId === userId)
            .map(([channelId, data]) => ({
                channelId,
                ...data
            }));
    }

    // Get next ticket number
    async getNextTicketNumber() {
        const tickets = fs.existsSync('./data/tickets.json')
            ? JSON.parse(fs.readFileSync('./data/tickets.json', 'utf8'))
            : { lastNumber: 0 };
        
        tickets.lastNumber += 1;
        
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        
        fs.writeFileSync('./data/tickets.json', JSON.stringify(tickets, null, 2));
        return tickets.lastNumber;
    }

    // Save active tickets to file
    saveTickets() {
        const data = {
            tickets: Array.from(this.activeTickets.entries()).map(([channelId, ticketData]) => ({
                channelId,
                ...ticketData
            }))
        };

        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }

        fs.writeFileSync('./data/active-tickets.json', JSON.stringify(data, null, 2));
    }

    // Load active tickets from file
    loadTickets() {
        try {
            if (fs.existsSync('./data/active-tickets.json')) {
                const data = JSON.parse(fs.readFileSync('./data/active-tickets.json', 'utf8'));
                data.tickets.forEach(ticket => {
                    this.activeTickets.set(ticket.channelId, {
                        userId: ticket.userId,
                        category: ticket.category,
                        claimedBy: ticket.claimedBy,
                        status: ticket.status,
                        createdAt: ticket.createdAt,
                        lastActivity: ticket.lastActivity
                    });
                });
            }
        } catch (error) {
            console.error('Error loading tickets:', error);
        }
    }

    // Setup inactivity check for tickets
    setupInactivityCheck() {
        setInterval(() => {
            const now = Date.now();
            this.activeTickets.forEach(async (ticket, channelId) => {
                const channel = this.client.channels.cache.get(channelId);
                if (!channel) {
                    this.activeTickets.delete(channelId);
                    return;
                }

                const inactiveFor = now - ticket.lastActivity;
                if (inactiveFor > TICKET_CONFIG.inactiveTimeout) {
                    // Notify before closing
                    await channel.send({
                        content: `This ticket has been inactive for 48 hours and will be closed in 24 hours.`
                    });

                    // Close after warning period
                    setTimeout(async () => {
                        if (this.activeTickets.has(channelId)) {
                            await this.closeTicket(
                                { channel, guild: channel.guild, user: { id: ticket.userId } },
                                'Closed due to inactivity'
                            );
                        }
                    }, 24 * 60 * 60 * 1000); // 24 hours
                }
            });
            
            // Save tickets every hour
            this.saveTickets();
        }, 60 * 60 * 1000); // Check every hour
    }
}

module.exports = TicketSystem;
