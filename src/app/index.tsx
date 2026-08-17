import { View, Text, StyleSheet } from "react-native";

export default function HomeScreen() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Cosmic Milestones</Text>
			<Text style={styles.subtitle}>Celestial Archive 01</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#14213D",
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		color: "#F4E9C1",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: "#6E8CB0",
	},
});
