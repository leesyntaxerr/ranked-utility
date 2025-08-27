const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const pugsRoleId = '1379462738471813120';

module.exports = {
	data: new SlashCommandBuilder()
		.setName('pugs')
		.setDescription('Manage the Pugs role.')
		
		.addSubcommand(subcommand =>
			subcommand
				.setName('list')
				.setDescription('Lists all users with the Pugs role.'))
		.addSubcommand(subcommand =>
			subcommand
				.setName('add')
				.setDescription('Adds the Pugs role to a user.')
				.addUserOption(option => option.setName('user').setDescription('The user to add the role to').setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('remove')
				.setDescription('Removes the Pugs role from a user.')
				.addUserOption(option => option.setName('user').setDescription('The user to remove the role from').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('vote')
                .setDescription('Creates a vote for a player to get the Pugs role')
                .addUserOption(option => option.setName('user').setDescription('Player to vote for').setRequired(true))),
	async execute(interaction) {
		await interaction.deferReply();

		const subcommand = interaction.options.getSubcommand();
		const role = await interaction.guild.roles.fetch(pugsRoleId);

		if (!role) {
			return interaction.editReply({ content: 'The Pugs role was not found. Please check the role ID.' });
		}

		if (subcommand === 'list') {
            await interaction.guild.members.fetch();
            const membersWithRole = interaction.guild.members.cache.filter(member => member.roles.cache.has(role.id));

            const total = membersWithRole.size;

            if (total === 0) {
                return interaction.editReply({ content: 'No users currently have the Pugs role.' });
            }

            const memberList = membersWithRole.map(member => `• ${member.user.tag} (<@${member.id}>)`).join('\n');

            const embed = new EmbedBuilder()
                .setColor(role.color || 'Aqua')
                .setTitle(`🐶 Pugs Members (${total})`)
                .setDescription(memberList)
                .setFooter({ text: `Total members: ${total}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
			

		} else if (subcommand === 'vote') {
            const target = interaction.options.getUser('user');
            const embed = new EmbedBuilder()
                .setTitle(`Vote for ${target.username} to receive the Pugs role`)
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
                .setDisabled(false); // Only PUGS managers can use this

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
                role: 'Pugs',
                targetId: target.id,
                startTime: Date.now(),
                yes: new Set(),
                no: new Set()
            });

        } else if (subcommand === 'add' || subcommand === 'remove') {
			const pugsManagerRoleId = '1379518503182405682'; // PUGS manager
			if (!interaction.member.roles.cache.has(pugsManagerRoleId)) {
                return interaction.editReply({ content: 'You do not have permission to use this command.', ephemeral: true });
            }

			const user = interaction.options.getUser('user');
			const member = await interaction.guild.members.fetch(user.id);

			if (subcommand === 'add') {
				if (member.roles.cache.has(role.id)) {
					return interaction.editReply({ content: `${user.username} already has the Pugs role.`, ephemeral: true });
				}

				// Add the role with reason
				await member.roles.add(role, `Command executed by ${interaction.user.tag}`);
				
				// Log the role addition
				const logEmbed = new EmbedBuilder()
					.setColor('Green')
					.setTitle('Pugs Role Added')
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

				await interaction.editReply({ content: `Successfully added the Pugs role to ${user.username}.` });
			} else { // remove
				if (!member.roles.cache.has(role.id)) {
					return interaction.editReply({ content: `${user.username} does not have the Pugs role.`, ephemeral: true });
				}

				// Remove the role with reason
				await member.roles.remove(role, `Command executed by ${interaction.user.tag}`);
				
				// Log the role removal
				const logEmbed = new EmbedBuilder()
					.setColor('Orange')
					.setTitle('Pugs Role Removed')
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

				await interaction.editReply({ content: `Successfully removed the Pugs role from ${user.username}.` });
			}
		}
	},
};
