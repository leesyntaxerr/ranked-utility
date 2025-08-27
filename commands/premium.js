const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const premiumRoleId = '1379462796697407569';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('premium')
		.setDescription('Manage the Premium role.')
		
		.addSubcommand(subcommand =>
			subcommand
				.setName('list')
				.setDescription('Lists all users with the Premium role.'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('add')
				.setDescription('Adds the Premium role to a user.')
				.addUserOption(option => option.setName('user').setDescription('The user to add the role to').setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('remove')
				.setDescription('Removes the Premium role from a user.')
				.addUserOption(option => option.setName('user').setDescription('The user to remove the role from').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('vote')
                .setDescription('Creates a vote for a player to get the Premium role')
                .addUserOption(option => option.setName('user').setDescription('Player to vote for').setRequired(true))),
	async execute(interaction) {
		await interaction.deferReply();

		const subcommand = interaction.options.getSubcommand();
		const role = await interaction.guild.roles.fetch(premiumRoleId);

		if (!role) {
			return interaction.editReply({ content: 'The Premium role was not found. Please check the role ID.' });
		}

		if (subcommand === 'list') {
            await interaction.guild.members.fetch();
            const membersWithRole = interaction.guild.members.cache.filter(m => m.roles.cache.has(role.id));
            const total = membersWithRole.size;
            if (!total) {
                return interaction.editReply({ content: 'No users currently have the Premium role.' });
            }
            const memberList = membersWithRole.map(m => `• ${m.user.tag} (<@${m.id}>)`).join('\n');
            const embed = new EmbedBuilder()
                .setColor(role.color || 'Gold')
                .setTitle(`💎 Premium Members (${total})`)
                .setDescription(memberList)
                .setFooter({ text: `Total members: ${total}` })
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
			

		} else if (subcommand === 'vote') {
            const target = interaction.options.getUser('user');
            const embed = new EmbedBuilder()
                .setTitle(`Vote for ${target.username} to receive the Premium role`)
                .setDescription('Please cast your vote below:\n\n' +
                    '⏰ Vote will expire in 7 days\n' +
                    '✅ Yes - Give the role\n' +
                    '❌ No - Do not give the role')
                .setColor('Aqua')
                .setFooter({ text: 'Vote will expire in 7 days' });

            const yesButton = new ButtonBuilder()
                .setCustomId(`ppp-vote-yes-${target.id}-vote`)
                .setLabel('Yes')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success);

            const noButton = new ButtonBuilder()
                .setCustomId(`ppp-vote-no-${target.id}-vote`)
                .setLabel('No')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger);

            const forceStopButton = new ButtonBuilder()
                .setCustomId(`ppp-vote-null-${target.id}-force-stop`)
                .setLabel('Force Stop')
                .setEmoji('🛑')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(false);

            const row = new ActionRowBuilder().addComponents(yesButton, noButton);
            const row2 = new ActionRowBuilder().addComponents(forceStopButton);

            const voteMessage = await interaction.editReply({ 
                embeds: [embed], 
                components: [row, row2], 
                fetchReply: true 
            });

            // Initialize vote session
            interaction.client.pppVoteSessions = interaction.client.pppVoteSessions ?? new Map();
            interaction.client.pppVoteSessions.set(voteMessage.id, {
                role: 'Premium',
                targetId: target.id,
                startTime: Date.now(),
                yes: new Set(),
                no: new Set()
            });

        } else if (subcommand === 'add' || subcommand === 'remove') {
			const premiumManagerRoleId = '1379518550791688274'; // PREMIUM manager
			if (!interaction.member.roles.cache.has(premiumManagerRoleId)) {
                return interaction.editReply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }

			const user = interaction.options.getUser('user');
			const member = await interaction.guild.members.fetch(user.id);

			if (subcommand === 'add') {
				if (member.roles.cache.has(role.id)) {
					return interaction.editReply({ content: `${user.username} already has the Premium role.`, ephemeral: true });
				}

				// Add the role with reason
				await member.roles.add(role, `Command executed by ${interaction.user.tag}`);
				
				// Log the role addition
				const logEmbed = new EmbedBuilder()
					.setColor('Green')
					.setTitle('Premium Role Added')
					.addFields(
						{ name: 'Member', value: member.toString(), inline: true },
						{ name: 'Moderator', value: interaction.user.toString(), inline: true },
						{ name: 'Reason', value: `Command executed by ${interaction.user.tag}`, inline: false }
					)
					.setTimestamp();

				// Use the client's sendPppLog method if available, otherwise fallback
				if (interaction.client.sendPppLog) {
					interaction.client.sendPppLog(interaction.guild, logEmbed);
				} else {
					const logChannel = interaction.guild.channels.cache.find(ch => ch.name === 'ppp-logs');
					if (logChannel) {
						await logChannel.send({ embeds: [logEmbed] });
					}
				}

				await interaction.editReply({ content: `Successfully added the Premium role to ${user.username}.` });
			} else { // remove
				if (!member.roles.cache.has(role.id)) {
					return interaction.editReply({ content: `${user.username} does not have the Premium role.`, ephemeral: true });
				}

				// Remove the role with reason
				await member.roles.remove(role, `Command executed by ${interaction.user.tag}`);
				
				// Log the role removal
				const logEmbed = new EmbedBuilder()
					.setColor('Orange')
					.setTitle('Premium Role Removed')
					.addFields(
						{ name: 'Member', value: member.toString(), inline: true },
						{ name: 'Moderator', value: interaction.user.toString(), inline: true },
						{ name: 'Reason', value: `Command executed by ${interaction.user.tag}`, inline: false }
					)
					.setTimestamp();

				// Use the client's sendPppLog method if available, otherwise fallback
				if (interaction.client.sendPppLog) {
					interaction.client.sendPppLog(interaction.guild, logEmbed);
				} else {
					const logChannel = interaction.guild.channels.cache.find(ch => ch.name === 'ppp-logs');
					if (logChannel) {
						await logChannel.send({ embeds: [logEmbed] });
					}
				}

				await interaction.editReply({ content: `Successfully removed the Premium role from ${user.username}.` });
			}
		}
	},
};
